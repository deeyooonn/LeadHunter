import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeadHunter — Local business discovery',
  description: 'Discover businesses in the Philippines and collect their public contact details.',
};
const themeScript = `(function(){var t='dark';try{var s=localStorage.getItem('leadhunter.theme');if(s==='light'||s==='dark')t=s;}catch(e){}document.documentElement.dataset.theme=t;})();`;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}</body></html>;
}
