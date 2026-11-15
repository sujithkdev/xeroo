export default function KrishnaPaymentQR({ amountPaise }: { amountPaise: number }) {
  const amount = (amountPaise / 100).toFixed(2);
  const payee = 'sujithkannan7686@oksbi';
  const link = 'upi://pay?' + new URLSearchParams({pa:payee,pn:'Sujith kannan',am:amount,cu:'INR'}).toString();
  return <section className="surface p-4 space-y-2">
    <h2 className="font-semibold">Pay ₹{amount} by UPI</h2>
    <img src="/images/krishna-upi.jpg" width="240" height="333" alt="Scan to pay Sujith kannan by UPI" />
    <p>Scan and enter ₹{amount}, or <a href={link} className="underline">open your UPI app</a>.</p>
    <p>{payee}</p><p className="text-sm">The shop will confirm receipt. If you already paid, keep your transaction reference.</p>
  </section>;
}
