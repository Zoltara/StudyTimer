import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
