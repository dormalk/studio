import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/soldiers');
  // Or, return a welcome component if preferred
  // return (
  //   <main className="flex min-h-screen flex-col items-center justify-center p-24">
  //     <h1 className="text-4xl font-bold">ברוכים הבאים למנהל צה"ל</h1>
  //     <p className="mt-4">מתבצעת הפנייה לדף החיילים...</p>
  //   </main>
  // );
}
