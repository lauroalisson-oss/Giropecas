// Abas que desenham TODO o conteúdo, não só a aba ativa.
//
// O componente real só monta a aba aberta. O erro que deixou Configurações
// em branco estava na aba Fiscal — a aba padrão é Empresa —, e um teste que
// desenhasse só a aba padrão passaria verde por cima dele. O conteúdo de
// uma aba depende do estado da página, não de qual aba está ativa: desenhar
// todas é o mesmo que clicar em cada uma.
export function Tabs({ children, className }) { return <div className={className}>{children}</div>; }
export function TabsList({ children, className }) { return <div className={className}>{children}</div>; }
export function TabsTrigger({ children, className }) { return <button className={className}>{children}</button>; }
export function TabsContent({ children, value }) { return <section data-aba={value}>{children}</section>; }
