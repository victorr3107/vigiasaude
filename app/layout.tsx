import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VigiaSaúde',
  description: 'Sistema de gestão de saúde pública municipal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Anti-flash: lê o tema do localStorage antes de renderizar */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var tema = localStorage.getItem('vs_tema') || 'dark';
                  document.documentElement.setAttribute('data-theme', tema);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}