import { firebaseEnv } from "./firebase-env.js";

const viteEnv = import.meta.env ?? {};

function pickConfigValue(viteKey, envKey) {
  const fromVite = viteEnv[viteKey];
  if (typeof fromVite === "string" && fromVite.trim() && !isPlaceholderCredential(fromVite.trim())) {
    return fromVite.trim();
  }
  const fromEnvFile = firebaseEnv?.[envKey];
  if (typeof fromEnvFile === "string" && fromEnvFile.trim() && !isPlaceholderCredential(fromEnvFile.trim())) {
    return fromEnvFile.trim();
  }
  return "";
}

function isPlaceholderCredential(value) {
  return !value || /your[_-]/i.test(value) || value.includes("your_api") || value.includes("your_project");
}

const firebaseConfig = {
  apiKey: pickConfigValue("VITE_FIREBASE_API_KEY", "apiKey"),
  authDomain: pickConfigValue("VITE_FIREBASE_AUTH_DOMAIN", "authDomain"),
  projectId: pickConfigValue("VITE_FIREBASE_PROJECT_ID", "projectId"),
  storageBucket: pickConfigValue("VITE_FIREBASE_STORAGE_BUCKET", "storageBucket"),
  messagingSenderId: pickConfigValue("VITE_FIREBASE_MESSAGING_SENDER_ID", "messagingSenderId"),
  appId: pickConfigValue("VITE_FIREBASE_APP_ID", "appId"),
};

const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let dbPromise = null;

function getFirebaseErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  if (code === "permission-denied" || message.includes("insufficient permissions")) {
    return "Firestore permission denied. In Firebase Console go to Firestore → Rules and allow access to settings and invoices collections, then publish.";
  }
  if (message.includes("not configured")) return message;
  return message || "Save & Generate failed. Check the browser console for details.";
}

async function getDb() {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured. Add credentials to .env, then run: npm run dev");
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
      const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const app = initializeApp(firebaseConfig);
      return getFirestore(app);
    })();
  }
  return dbPromise;
}

const COMPANY = {
  name: "Aadya Health Sciences Pvt Ltd",
  addressLines: [
    "No 303, 2nd Main, 1st Floor, Kasturinagar",
    "Bangalore 560043",
  ],
  gstin: "GSTIN/UIN: 29AAZCA5898A1ZX | State: Karnataka (29)",
  hsn: "HSN Code: 998431",
};

const LOGO_URL = "/LinQMD_Logo.svg";
const LOGO_FALLBACK_URL = "https://home.linqmd.com/assets/images/homepage/FooterLogo.svg";

const products = [
  { name: "Practice Hub Yearly Subscription", price: 12000 },
  { name: "AIHR", price: 6000 },
  { name: "Biz Card", price: 2000 },
  { name: "Custom Domain", price: 5000 },
  { name: "SAM", price: 3 },
  { name: "SAM AI", price: 9 },
  { name: "SAM AI Pro", price: 30 },
];

let currentInvoiceData = null;
let logoDataUrl = null;

/* ── Supply location state ──────────────────────────── */
function getSupplyType() {
  const checked = document.querySelector('input[name="supplyLocation"]:checked');
  return checked ? checked.value : "intra"; // "intra" or "inter"
}

function isInterState() {
  return getSupplyType() === "inter";
}

/* ── Amount in words ───────────────────────────────── */
function amountToWords(amount) {
  if (amount === 0) return "Zero Rupees Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convert(n) {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }

  return (
    convert(Math.floor(amount)) +
    (amount % 1 > 0 ? " and " + Math.round((amount % 1) * 100) + " Paise " : " ") +
    "Rupees Only"
  );
}

function formatBillingAddress(address) {
  return address.split(",").map((part) => part.trim()).filter(Boolean);
}

function formatBillingAddressHtml(address) {
  return formatBillingAddress(address).join("<br>");
}

function formatRupee(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

function getLogoSrc() {
  return logoDataUrl || LOGO_URL;
}

async function loadLogoForPdf() {
  const sources = [LOGO_URL, LOGO_FALLBACK_URL];
  for (const src of sources) {
    try {
      const response = await fetch(src, { mode: "cors" });
      if (!response.ok) continue;
      const blob = await response.blob();
      logoDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return;
    } catch {
      // try next source
    }
  }
}

/* ── Invoice HTML styles ────────────────────────────── */
function getInvoiceStyles(forPdf = false) {
  const baseStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1f2e; background: #fff; }
    .invoice-box { border: 2px solid #eee; padding: 30px; border-radius: 10px; background: #fff; width: 100%; max-width: 820px; margin: 0 auto; }
    .invoice-title { text-align: center; font-size: 26px; font-weight: bold; color: #0f2d52; letter-spacing: 0.08em; margin-bottom: 24px; }
    .invoice-header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 28px; flex-wrap: wrap; }
    .invoice-logo { flex: 0 0 auto; }
    .invoice-logo img { height: auto; width: auto; max-width: 200px; object-fit: contain; display: block; }
    .invoice-company { text-align: right; font-size: 13px; line-height: 1.6; color: #333; min-width: 200px; }
    .bill-to { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; font-size: 14px; line-height: 1.7; }
    .bill-to-address { line-height: 1.6; margin: 4px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
    th { background: #0f2d52; color: #fff; padding: 12px 14px; text-align: left; font-weight: 600; }
    th.num, td.num { text-align: right; }
    th.center, td.center { text-align: center; }
    td { padding: 10px 14px; border-bottom: 1px solid #ddd; vertical-align: top; word-break: break-word; }
    td.product-name { font-weight: 500; }
    .summary { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 20px; max-width: 380px; margin-left: auto; }
    .summary-item { display: flex; justify-content: space-between; gap: 24px; margin: 10px 0; font-size: 14px; }
    .summary-item span:last-child { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .grand-total { font-size: 18px; font-weight: bold; color: #0f2d52; border-top: 2px solid #333; padding-top: 10px; margin-top: 6px; }
    .words { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0 0; font-style: italic; font-size: 14px; line-height: 1.5; }
    .invoice-stamp { display: flex; align-items: flex-start; gap: 12px; margin-top: 24px; padding: 12px 16px; border: 1.5px dashed #ccc; border-radius: 8px; background: #f9f9f9; }
    .invoice-stamp-icon { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
    .invoice-stamp-text { font-size: 11px; color: #555; line-height: 1.55; }
    .invoice-stamp-text strong { display: block; font-size: 12px; color: #0f2d52; margin-bottom: 2px; }
  `;

  if (forPdf) {
    return `
      ${baseStyles}
      body { min-width: 860px; }
      .invoice-box { width: 820px; max-width: 820px; padding: 30px; }
      table { min-width: 760px; width: 100%; table-layout: fixed; }
      table th:nth-child(1), table td:nth-child(1) { width: 44%; }
      table th:nth-child(2), table td:nth-child(2) { width: 10%; }
      table th:nth-child(3), table td:nth-child(3) { width: 16%; }
      table th:nth-child(4), table td:nth-child(4) { width: 12%; }
      table th:nth-child(5), table td:nth-child(5) { width: 18%; }
      th, td { white-space: normal; overflow: hidden; }
    `;
  }

  return `
    ${baseStyles}
    @media (max-width: 720px) {
      .invoice-box { padding: 20px; }
      .invoice-title { font-size: 22px; }
      .invoice-header-row { gap: 16px; flex-direction: column; align-items: flex-start; }
      .invoice-company { text-align: left; }
      .bill-to { padding: 14px; }
      table { min-width: 0; }
      th, td { padding: 10px 10px; font-size: 13px; }
      .summary { margin-left: 0; max-width: 100%; }
      .summary-item { gap: 12px; }
    }
    @media (max-width: 520px) {
      table { display: block; overflow-x: auto; }
      th, td { white-space: nowrap; }
      .invoice-box { padding: 16px; }
      .invoice-title { font-size: 20px; }
    }
  `;
}

function buildInvoiceHeaderHtml() {
  const logoSrc = getLogoSrc();
  return `
    <div class="invoice-title">TAX INVOICE</div>
    <div class="invoice-header-row">
      <div class="invoice-logo">
        <img src="${logoSrc}" alt="Company logo" crossorigin="anonymous" onerror="this.onerror=null;this.src='${LOGO_FALLBACK_URL}'">
      </div>
      <div class="invoice-company">
        <div class="company-name">${COMPANY.name}</div>
        ${COMPANY.addressLines.map((line) => `<div>${line}</div>`).join("")}
        <div>${COMPANY.gstin}</div>
        <div>${COMPANY.hsn}</div>
      </div>
    </div>
  `;
}

/* ── Build invoice HTML (used for preview + PDF) ────── */
function buildFullInvoiceHtml(invoice, totals) {
  const productsRows = invoice.products
    .map(
      (p) => `
        <tr>
          <td class="product-name">${p.name}</td>
          <td class="center">${p.quantity}</td>
          <td class="num">${formatRupee(p.price)}</td>
          <td class="center">${p.productDiscount}%</td>
          <td class="num">${formatRupee(p.finalAmount)}</td>
        </tr>`
    )
    .join("");

  /* Build tax rows depending on supply type */
  const taxRows = totals.isInterState
    ? `<div class="summary-item"><span>IGST (18%):</span><span>${formatRupee(totals.igst)}</span></div>`
    : `<div class="summary-item"><span>SGST (9%):</span><span>${formatRupee(totals.sgst)}</span></div>
       <div class="summary-item"><span>CGST (9%):</span><span>${formatRupee(totals.cgst)}</span></div>`;

  const supplyTypeLabel = totals.isInterState
    ? "Inter-State Supply (Outside Karnataka)"
    : "Intra-State Supply (Within Karnataka)";

  return `
    <div class="invoice-box">
      ${buildInvoiceHeaderHtml()}

      <div class="bill-to">
        <div><strong>Bill To:</strong> ${invoice.billingName}</div>
        <div><strong>Address:</strong></div>
        <div class="bill-to-address">${formatBillingAddressHtml(invoice.billingAddress)}</div>
        <div><strong>Contact:</strong> ${invoice.contactNumber}</div>
        <div><strong>Date:</strong> ${invoice.billingDate}</div>
        <div><strong>Invoice #:</strong> ${invoice.invoiceNumber}</div>
        <div><strong>Supply Type:</strong> ${supplyTypeLabel}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th class="center">Qty</th>
            <th class="num">Price</th>
            <th class="center">Disc%</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${productsRows}</tbody>
      </table>

      <div class="summary">
        <div class="summary-item"><span>Subtotal:</span><span>${formatRupee(totals.subtotal)}</span></div>
        <div class="summary-item"><span>Invoice Discount (${totals.overallDiscPercent}%):</span><span>${formatRupee(totals.overallDiscAmt)}</span></div>
        <div class="summary-item"><span>Taxable Amount:</span><span>${formatRupee(totals.taxable)}</span></div>
        ${taxRows}
        <div class="summary-item grand-total"><span>Grand Total:</span><span>${formatRupee(totals.grandTotal)}</span></div>
      </div>

      <div class="words"><strong>Amount in Words:</strong> ${amountToWords(totals.grandTotal)}</div>

      <div class="invoice-stamp">
        <div class="invoice-stamp-icon">🤖</div>
        <div class="invoice-stamp-text">
          <strong>This is a Computer Generated Invoice</strong>
          Generated by LinQMD Invoice System · Aadya Health Sciences Pvt Ltd ·
          GSTIN: 29AAZCA5898A1ZX · This invoice does not require a physical signature.
        </div>
      </div>
    </div>
  `;
}

/* ── Render product rows ────────────────────────────── */
function renderProductRows() {
  const tbody = document.getElementById("productBody");
  if (!tbody) {
    console.error("Product table not found.");
    return;
  }
  tbody.innerHTML = "";
  products.forEach((prod, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = idx;
    tr.dataset.price = prod.price;
    tr.innerHTML = `
      <td data-label="Select"><input type="checkbox" class="product-check" data-index="${idx}" aria-label="Select ${prod.name}"></td>
      <td class="product-name" data-label="Product">${prod.name}</td>
      <td data-label="Qty"><input type="number" class="qty" value="1" min="1" disabled data-index="${idx}" aria-label="Quantity for ${prod.name}"></td>
      <td class="price-cell" data-label="Price">₹ ${prod.price}</td>
      <td data-label="Disc %"><input type="number" class="discount" value="0" min="0" max="100" step="0.1" disabled data-index="${idx}" aria-label="Discount for ${prod.name}"></td>
      <td class="amount-cell" data-label="Amount" id="amount-${idx}">0</td>
    `;
    tbody.appendChild(tr);
  });
  attachEvents();
}

function attachEvents() {
  document.querySelectorAll(".product-check").forEach((cb) => {
    cb.addEventListener("change", function () {
      const row = this.closest("tr");
      const qtyInp = row.querySelector(".qty");
      const discInp = row.querySelector(".discount");
      const enabled = this.checked;
      qtyInp.disabled = !enabled;
      discInp.disabled = !enabled;
      if (enabled && qtyInp.value === "") qtyInp.value = 1;
      if (!enabled) { qtyInp.value = 1; discInp.value = 0; }
      recalcAll();
    });
  });

  document.querySelectorAll(".qty, .discount").forEach((inp) => {
    inp.addEventListener("input", recalcAll);
  });

  document.getElementById("overallDiscount").addEventListener("input", recalcAll);
}

/* ── Recalculate totals ─────────────────────────────── */
function recalcAll() {
  let subtotal = 0;
  const productRows = document.querySelectorAll("#productBody tr");
  const inter = isInterState();

  productRows.forEach((row, idx) => {
    const cb = row.querySelector(".product-check");
    if (!cb.checked) {
      document.getElementById(`amount-${idx}`).innerText = "0";
      return;
    }
    const qty = parseFloat(row.querySelector(".qty").value) || 1;
    const discount = parseFloat(row.querySelector(".discount").value) || 0;
    const price = parseFloat(row.dataset.price);
    const productTotal = price * qty;
    const discAmt = (productTotal * discount) / 100;
    const finalAmt = productTotal - discAmt;
    document.getElementById(`amount-${idx}`).innerText = finalAmt.toFixed(2);
    subtotal += finalAmt;
  });

  const overallDiscPercent = parseFloat(document.getElementById("overallDiscount").value) || 0;
  const overallDiscAmt = (subtotal * overallDiscPercent) / 100;
  const taxable = subtotal - overallDiscAmt;

  let sgst = 0, cgst = 0, igst = 0;
  if (inter) {
    igst = (taxable * 18) / 100;
  } else {
    sgst = (taxable * 9) / 100;
    cgst = (taxable * 9) / 100;
  }
  const grandTotal = taxable + (inter ? igst : sgst + cgst);

  document.getElementById("subtotal").innerText = subtotal.toFixed(2);
  document.getElementById("invoiceDiscount").innerText = overallDiscAmt.toFixed(2);
  document.getElementById("taxable").innerText = taxable.toFixed(2);
  document.getElementById("sgst").innerText = sgst.toFixed(2);
  document.getElementById("cgst").innerText = cgst.toFixed(2);
  document.getElementById("igst").innerText = igst.toFixed(2);
  document.getElementById("grandTotal").innerText = grandTotal.toFixed(2);
  document.getElementById("amountWords").innerText = amountToWords(grandTotal);

  /* Show/hide tax rows */
  document.getElementById("sgstRow").style.display = inter ? "none" : "flex";
  document.getElementById("cgstRow").style.display = inter ? "none" : "flex";
  document.getElementById("igstRow").style.display = inter ? "flex" : "none";

  return {
    subtotal, overallDiscAmt, taxable, sgst, cgst, igst, grandTotal,
    overallDiscPercent, isInterState: inter, productsData: collectProducts(),
  };
}

function collectProducts() {
  const items = [];
  document.querySelectorAll("#productBody tr").forEach((row, idx) => {
    const cb = row.querySelector(".product-check");
    if (!cb.checked) return;
    items.push({
      name: products[idx].name,
      quantity: parseFloat(row.querySelector(".qty").value) || 1,
      price: products[idx].price,
      productDiscount: parseFloat(row.querySelector(".discount").value) || 0,
      finalAmount: parseFloat(document.getElementById(`amount-${idx}`).innerText) || 0,
    });
  });
  return items;
}

function buildInvoiceFromForm() {
  const billingName = document.getElementById("billingName").value.trim();
  const billingAddress = document.getElementById("billingAddress").value.trim();
  const contactNumber = document.getElementById("billingContact").value.trim();
  const billingDate = document.getElementById("billingDate").value;

  if (!billingName || !billingAddress || !contactNumber || !billingDate) {
    alert("Please fill all billing fields");
    return null;
  }

  const totals = recalcAll();
  const productsArray = collectProducts();
  if (productsArray.length === 0) {
    alert("Select at least one product");
    return null;
  }

  const year = new Date().getFullYear();
  const localNumber = `INV_AHSPL_${year}_LOCAL_${Date.now().toString().slice(-4)}`;

  return {
    invoiceData: {
      invoiceNumber: localNumber,
      billingName, billingAddress, contactNumber, billingDate,
      products: productsArray,
      subtotal: totals.subtotal,
      invoiceDiscount: totals.overallDiscAmt,
      taxableAmount: totals.taxable,
      sgst: totals.sgst,
      cgst: totals.cgst,
      igst: totals.igst,
      isInterState: totals.isInterState,
      grandTotal: totals.grandTotal,
    },
    totals,
  };
}

/* ── Supply location UI toggle ──────────────────────── */
function initSupplyToggle() {
  const pillIntra = document.getElementById("pillIntra");
  const pillInter = document.getElementById("pillInter");
  const note = document.getElementById("gstInfoNote");
  const radioIntra = document.getElementById("supplyIntra");
  const radioInter = document.getElementById("supplyInter");

  function updateUI(inter) {
    if (inter) {
      pillIntra.classList.remove("active");
      pillInter.classList.remove("active");
      pillInter.classList.add("active-igst");
      note.className = "gst-info-note inter";
      note.innerHTML = `<span class="gst-badge">IGST 18%</span>
        Inter-state supply — single integrated tax collected by central government.`;
    } else {
      pillInter.classList.remove("active-igst");
      pillIntra.classList.add("active");
      note.className = "gst-info-note intra";
      note.innerHTML = `<span class="gst-badge">SGST 9% + CGST 9%</span>
        Intra-state supply — tax is split between Karnataka state government and central government.`;
    }
    recalcAll();
  }

  radioIntra.addEventListener("change", () => updateUI(false));
  radioInter.addEventListener("change", () => updateUI(true));

  /* clicking the pill labels triggers the hidden radio inputs automatically */
}

/* ── Preview ────────────────────────────────────────── */
function closePreview() {
  const modal = document.getElementById("invoicePreview");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function showPreview() {
  const billingName = document.getElementById("billingName").value.trim();
  const billingAddress = document.getElementById("billingAddress").value.trim();
  const contactNumber = document.getElementById("billingContact").value.trim();
  const billingDate = document.getElementById("billingDate").value;

  if (!billingName || !billingAddress || !contactNumber || !billingDate) {
    alert("Please fill all billing fields first");
    return;
  }
  const productsArray = collectProducts();
  if (productsArray.length === 0) {
    alert("Select at least one product");
    return;
  }

  const totals = recalcAll();
  const invoiceNumber = currentInvoiceData?.invoiceData?.invoiceNumber ||
    `INV_AHSPL_${new Date().getFullYear()}_XXX (To be generated)`;

  const previewInvoice = {
    billingName, billingAddress, contactNumber, billingDate, invoiceNumber,
    products: productsArray,
  };

  const modal = document.getElementById("invoicePreview");
  const content = document.getElementById("previewContent");
  if (!modal || !content) return;

  try {
    content.innerHTML = `<style>${getInvoiceStyles()}</style>${buildFullInvoiceHtml(previewInvoice, totals)}`;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  } catch (error) {
    console.error("Preview failed:", error);
    alert("Could not open preview. Please refresh the page and try again.");
  }
}

/* ── Firebase: generate invoice number ─────────────── */
async function generateInvoiceNumber() {
  const db = await getDb();
  const { doc, runTransaction } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const counterRef = doc(db, "settings", "invoiceCounter");
  const START_COUNT = 49;

  const newCount = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    let current = START_COUNT;
    if (counterSnap.exists()) {
      const parsed = Number(counterSnap.data().value);
      current = Number.isFinite(parsed) ? parsed : START_COUNT;
    }
    const next = current + 1;
    transaction.set(counterRef, { value: next }, { merge: true });
    return next;
  });

  const year = new Date().getFullYear();
  return `INV_AHSPL_${year}_${String(newCount).padStart(3, "0")}`;
}

async function saveInvoiceToFirestore(invoiceData) {
  const db = await getDb();
  const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const invoicesCol = collection(db, "invoices");
  const docRef = await addDoc(invoicesCol, { ...invoiceData, timestamp: serverTimestamp() });
  return docRef.id;
}

/* ── PDF generation ─────────────────────────────────── */
async function generatePDF(invoice, totals) {
  if (!window.jspdf?.jsPDF) throw new Error("PDF library failed to load. Refresh the page and try again.");
  if (!window.html2canvas) throw new Error("PDF renderer failed to load. Refresh the page and try again.");

  if (!logoDataUrl) await loadLogoForPdf();

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;left:-100000px;top:0;width:860px;min-width:860px;overflow:visible;background:#fff;";
  wrapper.innerHTML = `<style>${getInvoiceStyles(true)}</style>${buildFullInvoiceHtml(invoice, totals)}`;
  document.body.appendChild(wrapper);

  const invoiceBox = wrapper.querySelector(".invoice-box");
  const images = [...invoiceBox.querySelectorAll("img")];
  await Promise.all(images.map((img) => new Promise((resolve) => {
    if (img.complete) { resolve(); return; }
    img.onload = resolve;
    img.onerror = resolve;
  })));

  try {
    const canvas = await window.html2canvas(invoiceBox, {
      scale: 2, useCORS: true, allowTaint: false, backgroundColor: "#ffffff", logging: false,
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * contentWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgHeight;
    let position = margin;
    pdf.addImage(imgData, "PNG", margin, position, contentWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, contentWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }

    return pdf;
  } finally {
    document.body.removeChild(wrapper);
  }
}

/* ── App init ───────────────────────────────────────── */
function initApp() {
  renderProductRows();
  loadLogoForPdf();
  recalcAll();
  initSupplyToggle();

  const today = new Date().toISOString().split("T")[0];
  const billingDate = document.getElementById("billingDate");
  if (billingDate) billingDate.value = today;

  document.getElementById("generateBtn")?.addEventListener("click", async () => {
    const built = buildInvoiceFromForm();
    if (!built) return;
    const { totals } = built;
    try {
      const invoiceNumber = await generateInvoiceNumber();
      const invoiceData = { ...built.invoiceData, invoiceNumber };
      await saveInvoiceToFirestore(invoiceData);
      currentInvoiceData = { invoiceData, totals };
      alert(`Invoice ${invoiceNumber} saved successfully. You can now download the PDF.`);
    } catch (error) {
      console.error("Generate invoice failed:", error);
      alert(getFirebaseErrorMessage(error));
    }
  });

  document.getElementById("previewBtn")?.addEventListener("click", showPreview);
  document.getElementById("closePreviewBtn")?.addEventListener("click", closePreview);
  document.querySelector("[data-close-preview]")?.addEventListener("click", closePreview);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePreview(); });

  document.getElementById("downloadBtn")?.addEventListener("click", async () => {
    const downloadBtn = document.getElementById("downloadBtn");
    try {
      if (!currentInvoiceData) {
        const localInvoice = buildInvoiceFromForm();
        if (!localInvoice) return;
        currentInvoiceData = localInvoice;
      }
      const { invoiceData, totals } = currentInvoiceData;
      const originalText = downloadBtn.textContent;
      downloadBtn.disabled = true;
      downloadBtn.textContent = "Generating PDF...";
      const pdfDoc = await generatePDF(invoiceData, totals);
      pdfDoc.save(`invoice_${invoiceData.invoiceNumber}.pdf`);
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
    } catch (error) {
      console.error("Download failed:", error);
      alert(error.message || "Download failed. Please try again.");
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = "⬇️ Download PDF";
      }
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}