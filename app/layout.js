import './globals.css'

export const metadata = {
  title: 'Second Crew - AI Website Report Generator',
  description: 'Generate comprehensive website audits with AI insights',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
