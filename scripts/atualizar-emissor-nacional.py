#!/usr/bin/env python3
"""Atualiza shared/emissor-nacional.json a partir da planilha oficial.

A planilha de municípios aderentes da NFS-e Nacional é publicada em
https://www.gov.br/nfse/pt-br/municipios/municipios-aderentes (link
"lista de municípios", arquivo municipios-aderentes-AAAAMMDD.xlsx).

Uso:
    python3 scripts/atualizar-emissor-nacional.py municipios-aderentes-20260928.xlsx

Só usa a biblioteca padrão do Python (o .xlsx é um zip de XMLs).
"""
import json
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
DESTINO = Path(__file__).resolve().parent.parent / 'shared' / 'emissor-nacional.json'


def chave(uf, nome):
    """Mesma normalização de shared/emissor-nacional.js."""
    sem_acento = unicodedata.normalize('NFD', nome)
    sem_acento = ''.join(c for c in sem_acento if unicodedata.category(c) != 'Mn')
    return f"{uf.strip().upper()}|{re.sub(r'[^A-Z0-9]', '', sem_acento.upper())}"


def linhas(caminho):
    with zipfile.ZipFile(caminho) as z:
        textos = [
            ''.join(t.text or '' for t in si.iter('{%s}t' % NS['m']))
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)
        ]
        folha = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    for r in folha.iter('{%s}row' % NS['m']):
        valores = []
        for c in r.findall('m:c', NS):
            v = c.find('m:v', NS)
            valores.append('' if v is None else (textos[int(v.text)] if c.get('t') == 's' else v.text))
        yield valores


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    caminho = sys.argv[1]
    data = re.search(r'(\d{8})', Path(caminho).name)
    todas = list(linhas(caminho))
    cab = todas[0]
    for campo in ('UF', 'NomeMunicipio', 'AderenteEmissorNacional', 'StatusConvenioSEFIN'):
        if campo not in cab:
            sys.exit(f'Coluna "{campo}" não encontrada — o formato da planilha mudou.')
    com, sem = [], []
    for v in todas[1:]:
        d = dict(zip(cab, v))
        if not d.get('UF') or not d.get('NomeMunicipio'):
            continue
        k = chave(d['UF'], d['NomeMunicipio'])
        usa = d['AderenteEmissorNacional'].strip().lower() == 'sim' \
            and d['StatusConvenioSEFIN'].strip().lower() == 'conveniado ativo'
        (com if usa else sem).append(k)
    saida = {
        'fonte': 'https://www.gov.br/nfse/pt-br/municipios/municipios-aderentes',
        'atualizado': f'{data.group(1)[:4]}-{data.group(1)[4:6]}-{data.group(1)[6:]}' if data else None,
        'comEmissorNacional': sorted(com),
        'semEmissorNacional': sorted(sem),
    }
    DESTINO.write_text(json.dumps(saida, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{DESTINO}: {len(com)} com Emissor Nacional, {len(sem)} sem.')


if __name__ == '__main__':
    main()
