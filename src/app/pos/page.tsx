import { PageHero, Section, Grid, FeatureCard, Notice } from "@/components/ui";
import * as I from "@/components/icons";
import { meta } from "@/lib/meta";

const POS_URL = "https://pos.flameph.org";

export const metadata = meta(
  "FLAME POS — Free POS for Filipino MSMEs",
  "A free cloud-based point-of-sale and business management system for Filipino MSMEs.",
  "/pos",
);

const FEATURES = [
  { title: "Fast, practical checkout", text: "Record cash, GCash, Maya, card, bank transfer and other payments in one simple sales screen.", icon: <I.IconPos /> },
  { title: "Products and inventory", text: "Manage products, barcodes, stock movements and low-stock levels by branch.", icon: <I.IconStore /> },
  { title: "Receipts and sales history", text: "Print or download receipts and review completed sales without deleting the transaction trail.", icon: <I.IconFile /> },
  { title: "Purchases and suppliers", text: "Create purchase orders, receive stock and keep supplier and cost records together.", icon: <I.IconCart /> },
  { title: "Customers and employees", text: "Keep customer records and give team members access based on their work role.", icon: <I.IconUsers /> },
  { title: "Dashboard and reports", text: "Understand sales, expenses, inventory and estimated gross profit using clear business summaries.", icon: <I.IconSpark /> },
];

const USERS = [
  "Sari-sari stores and retail shops",
  "Cafés, bakeries and restaurants",
  "Service businesses",
  "Online sellers",
  "Wholesalers and distributors",
  "Growing businesses with multiple branches",
];

const FAQ = [
  { q: "Is FLAME POS free?", a: "Yes. You can create a FLAME POS account and start using the core system for free." },
  { q: "Do I need to install software?", a: "No. FLAME POS works in a modern web browser on a phone, tablet, laptop or desktop." },
  { q: "Can I record GCash and Maya payments?", a: "Yes. FLAME POS can record these payment methods and an optional reference number. This records the payment; it is not a direct GCash or Maya payment-gateway connection." },
  { q: "Can I print receipts?", a: "Yes. You can print receipts or download a PDF. FLAME POS does not claim BIR accreditation." },
  { q: "Can another business see my data?", a: "FLAME POS is designed with organization-based access controls so authorized users can access only the business and branches assigned to them." },
];

export default function Page() {
  return (
    <>
      <PageHero
        status="live"
        fil="Free POS for Filipino MSMEs"
        title="Your Business Deserves a Smarter POS."
        path="/pos"
        intro="FLAME POS is a free cloud-based Point of Sale and business management system built to help Filipino MSMEs sell, track inventory, understand their business and grow."
      >
        <a href={`${POS_URL}/register`} className="btn btn-flame text-base">Start using FLAME POS — free</a>
        <a href={`${POS_URL}/login`} className="btn btn-outline text-base">Sign in to FLAME POS</a>
      </PageHero>

      <Section title="Sell. Track. Understand. Grow." intro="One easy-to-use workspace for daily selling and the business records behind every sale.">
        <Grid>{FEATURES.map((feature) => <FeatureCard key={feature.title} {...feature} status="live" />)}</Grid>
      </Section>

      <section className="bg-bg-soft">
        <Section title="Made for the way Filipino MSMEs work" intro="Use FLAME POS on the device you already have, then add products, people and branches as your business grows.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {USERS.map((user) => (
              <div key={user} className="card flex min-h-20 items-center gap-3 p-4">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok-soft font-bold text-ok">✓</span>
                <span className="font-semibold">{user}</span>
              </div>
            ))}
          </div>
        </Section>
      </section>

      <Section title="Start in three simple steps">
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            ["Create your free account", "Register securely using your email address."],
            ["Set up your business", "Add your business, receipt and tax-display preferences."],
            ["Add a product and sell", "Enter your opening stock, open the POS and record your first sale."],
          ].map(([title, text], index) => (
            <li key={title} className="card p-5">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-extrabold text-primary-fg">{index + 1}</span>
              <h3 className="mt-3 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <a href={`${POS_URL}/register`} className="btn btn-flame text-base">Create my free FLAME POS account</a>
        </div>
      </Section>

      <Section title="Built with business data protection in mind">
        <Notice tone="info">FLAME POS uses authenticated accounts, role-based permissions and organization-based data access. Never share your password or verification links with anyone.</Notice>
      </Section>

      <Section title="Frequently asked questions">
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="card p-4">
              <summary className="min-h-8 cursor-pointer font-bold">{item.q}</summary>
              <p className="mt-2 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <section className="bg-primary text-primary-fg">
        <div className="container-x py-12 text-center sm:py-16">
          <p className="font-display font-bold uppercase tracking-wider text-gold">FLAME POS is live</p>
          <h2 className="mx-auto mt-2 max-w-3xl text-3xl font-extrabold sm:text-4xl">Start running your business with clearer records today.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">No waitlist. Create your account and begin setting up your business now.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href={`${POS_URL}/register`} className="btn btn-flame text-base">Start using FLAME POS — free</a>
            <a href={`${POS_URL}/login`} className="btn bg-white text-primary hover:bg-white/90">Already have an account? Sign in</a>
          </div>
        </div>
      </section>
    </>
  );
}
