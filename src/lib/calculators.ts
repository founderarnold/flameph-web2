// The 15 FLAME PH business calculators: the same list the Business calculators page has always shown.
// Each calculator is a standalone page in src/calculators/<id>.html, served to members at /calculators/<id>.
// Shared by Business calculators (/business-calculators), Workspace and More, so all three always match.
export type Calculator = { id: string; title: string; text: string };

export const CALCULATOR_GROUPS: { title: string; items: Calculator[] }[] = [
  {
    title: "Presyo, margin at break-even",
    items: [
      { id: "markup-margin", title: "Markup at Margin", text: "Tama ba ang presyo ko? Alamin ang kita bawat piraso." },
      { id: "break-even", title: "Break-Even", text: "Ilang piraso kada araw para hindi malugi?" },
      { id: "roi", title: "Return on Investment (ROI)", text: "Sulit ba ang bibilhing makina, sasakyan o campaign? Gaano kabilis babalik ang pera?" },
      { id: "job-service-pricing", title: "Job & Service Pricing", text: "Magkano ang singil sa job, kasama ang oras, materyales at overhead?" },
    ],
  },
  {
    title: "Cash flow at working capital",
    items: [
      { id: "cash-flow", title: "8-Week Cash Flow", text: "Kukulangin ba ako ng pera sa susunod na 2 buwan?" },
      { id: "working-capital", title: "Working Capital & Quick Ratio", text: "Kaya ko bang bayaran ang mga utang sa loob ng 12 buwan? Handa ba ako sa loan?" },
      { id: "receivables-aging", title: "Receivable Aging & Collection Tracker", text: "Sino ang may utang, gaano na katagal, at paalala sa Messenger o Viber." },
    ],
  },
  {
    title: "Operasyon at logistics",
    items: [
      { id: "inventory-turnover", title: "Inventory Investment & Turnover", text: "Magkano ang nakatali sa stock, at kailan mag-order ulit?" },
      { id: "fleet-cost", title: "Vehicle & Fleet Operating Cost", text: "Totoong gastos kada km at kada delivery, at tamang delivery fee." },
      { id: "capacity-planning", title: "Capacity Planning", text: "Ano ang bottleneck ko, at kailan kailangan ng dagdag na tauhan o makina?" },
    ],
  },
  {
    title: "Paglago, tauhan at marketing",
    items: [
      { id: "employee-cost", title: "Total Employee Cost", text: "Magkano talaga ang empleyado, kasama ang SSS, PhilHealth, Pag-IBIG at 13th month?" },
      { id: "payroll", title: "Payroll", text: "Sahod kada cutoff: overtime, holiday, kaltas at withholding tax, may payslip." },
      { id: "expansion-readiness", title: "Hiring & Expansion Readiness", text: "Kaya na ba ng pera ko ang bagong tauhan o bagong branch?" },
      { id: "franchise-unit-economics", title: "Franchise / Micro-Fulfillment Unit Economics", text: "Puhunan, kita kada buwan at payback ng franchise, micro-store o depot." },
      { id: "customer-acquisition-cost", title: "Customer Acquisition Cost", text: "Magkano ang gastos sa bawat bagong customer, at sulit ba ang ads ko?" },
    ],
  },
];

export const CALCULATORS = CALCULATOR_GROUPS.flatMap((g) => g.items);
export const calculatorHref = (id: string, base = "/workspace/calculators") => `${base}?calc=${id}`;
