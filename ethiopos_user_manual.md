# EthioPOS User Manual
**Version 1.0 · English & አማርኛ Quick Reference**
*For Ethiopian Business Owners, Managers & Cashiers*

---

## Table of Contents
1. [Getting Started](#1-getting-started)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Point of Sale (POS)](#3-point-of-sale-pos)
4. [Inventory Management](#4-inventory-management)
5. [Accounting & Finance](#5-accounting--finance)
6. [HR & Payroll](#6-hr--payroll)
7. [Invoices & Quotations](#7-invoices--quotations)
8. [Warehouse Management](#8-warehouse-management)
9. [CRM & Loyalty](#9-crm--loyalty)
10. [AI Intelligence](#10-ai-intelligence)
11. [Multi-Branch Management](#11-multi-branch-management)
12. [Reports](#12-reports)
13. [Security & User Roles](#13-security--user-roles)
14. [Amharic Quick Reference](#14-amharic-quick-reference-አማርኛ-ፈጣን-መመሪያ)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Getting Started

### System Requirements
| Device | Minimum | Recommended |
|---|---|---|
| Browser | Chrome 90+, Firefox 90+, Safari 14+ | Chrome (latest) |
| Internet | 512 Kbps | 2 Mbps+ |
| Screen | 1024×768 | 1366×768+ |
| Mobile | Android 8+, iOS 13+ | Android 12+ / iOS 16+ |

> **Offline mode**: EthioPOS works without internet. Sales are saved locally and sync automatically when connection is restored.

### 1.1 Logging In

1. Go to **https://app.ethiopos.et** in your browser
2. Select your **role** from the 8 available options
3. Enter your **email/phone** and **password**
4. For fast POS login, enter your **4-digit PIN** (cashiers)
5. If MFA is enabled, enter the **6-digit OTP** from your authenticator app

**Demo Credentials (Trial Account):**
| Role | Email | Password | PIN |
|---|---|---|---|
| Business Owner | owner@yourbusiness.et | Set during signup | 1234 |
| Cashier | cashier@yourbusiness.et | Set by admin | 4567 |

### 1.2 First-Time Setup Wizard

When you first sign in, the **Setup Wizard** guides you through:

**Step 1 — Business Info** (2 minutes)
- Enter your business name, TIN number, and VAT number
- Select your business type (Retail, Pharmacy, Restaurant, etc.)
- Choose your city

**Step 2 — Branches & Team** (3 minutes)
- Set number of branches
- Choose interface language (English / አማርኛ / Afaan Oromo)

**Step 3 — Payment Methods** (1 minute)
- Enable Telebirr, CBE Birr, Cash, Credit Sales

**Step 4 — Ethiopian Tax Settings** (2 minutes)
- Confirm VAT registration number
- Review 15% VAT auto-calculation

**Step 5 — Go Live!**
- Import products (Excel/CSV) or add manually
- Total setup time: **under 25 minutes**

---

## 2. Dashboard Overview

The dashboard gives you a real-time view of your business performance.

### Key Metrics Cards
| Card | What It Shows |
|---|---|
| Today's Revenue | Total sales in ETB for today |
| Transactions | Number of sales processed |
| Net Profit (Month) | Revenue minus all expenses |
| Outstanding Credit | Total unpaid credit sales |

### Dashboard Sections
- **Revenue Chart** — This week's sales vs expenses (bar chart)
- **Sales by Category** — Pie chart showing product categories
- **Critical Alerts** — Low stock, overdue credit, VAT deadlines
- **Recent Transactions** — Last 5 sales with customer & payment info
- **Branch Status** — All branches online/offline with revenue

### Switching Branches
Use the **branch selector** in the top navigation bar to switch between your branches. All data updates instantly.

---

## 3. Point of Sale (POS)

The POS module is the heart of EthioPOS. Process sales quickly with barcode scanning and multiple payment methods.

### 3.1 Processing a Sale

**Step-by-step:**
1. Click **Point of Sale** in the left menu
2. **Add products** to cart:
   - Click on a product card, OR
   - Type in the search bar, OR
   - Click 📷 to scan a barcode
3. **Adjust quantity** using − and + buttons next to each item
4. **Select payment method**: Cash / Telebirr / CBE Birr / Credit
5. Click **Charge ETB [amount]**
6. The receipt appears — click **🖨 Print** or close

> **Tip**: VAT (15%) is automatically calculated and shown before charging.

### 3.2 Telebirr Payment
1. Select **Telebirr** as payment method
2. Enter customer's phone number if prompted
3. Customer receives a Telebirr notification on their phone
4. Customer approves the payment
5. Sale is automatically confirmed

### 3.3 CBE Birr Payment
1. Select **CBE Birr** as payment method
2. A QR code appears on screen
3. Customer scans with their CBE Birr app
4. Payment is confirmed within seconds

### 3.4 Credit Sales
1. Select **Credit** as payment method
2. Select or create the customer account
3. Sale is recorded as "Outstanding"
4. Track and collect credit payments in **CRM → Customer → Credit**

### 3.5 Discounts
- **Percentage discount**: Enter % in the discount field before charging
- **Fixed discount**: Enter ETB amount in the discount field
- **Loyalty discount**: Applied automatically if customer is Gold/Platinum tier

### 3.6 Returns & Refunds
1. Go to **Invoices → Credit Notes**
2. Click **+ New Credit Note**
3. Select the original invoice
4. Select items being returned and quantities
5. Choose reason: Damaged, Customer changed mind, Wrong item
6. Save — stock is automatically returned

### 3.7 Receipt Printing
EthioPOS supports:
- **Thermal receipt printers** (USB/Bluetooth)
- **A4 printer** (full invoice format)
- **PDF receipt** (email to customer)
- **Digital receipt** (WhatsApp message)

---

## 4. Inventory Management

### 4.1 Adding Products

1. Go to **Inventory**
2. Click **+ Add Product**
3. Fill in:
   - **Product Name** (required)
   - **SKU** — your internal code (e.g., P001)
   - **Barcode** — scan or type
   - **Category** — Grocery, Grain, Dairy, etc.
   - **Selling Price (ETB)** — what you charge customers
   - **Cost Price (ETB)** — what you paid to the supplier
   - **Reorder Point** — alert threshold (e.g., 20 units)
   - **Supplier** — link to your supplier
4. Click **Save**

### 4.2 Importing Products from Excel/CSV

1. Go to **Inventory**
2. Click **Import Products**
3. Download the **Excel template** first
4. Fill in your products (one per row)
5. Upload the file
6. Review the import summary — fix any errors

**Excel template columns:**
`SKU | Name | Category | Selling Price | Cost Price | Reorder Point | Opening Stock | Barcode | Supplier`

### 4.3 Stock Status Colors
| Color | Status | Action Required |
|---|---|---|
| 🟢 Green | OK — sufficient stock | None |
| 🟡 Yellow | Low — below reorder point | Order soon |
| 🔴 Red | Critical — nearly out | Order immediately |

### 4.4 Low Stock Alerts
EthioPOS automatically notifies you when stock falls below the reorder point:
- **Dashboard alert** (Critical Alerts section)
- **Notification bell** (top of screen)
- **AI Reorder Suggestions** (AI Intelligence module)
- **SMS alert** (if configured)

---

## 5. Accounting & Finance

### 5.1 Chart of Accounts

EthioPOS comes with a standard **Ethiopian Chart of Accounts** pre-configured:
- **Assets**: Cash & Bank, Receivables, Inventory, Fixed Assets
- **Liabilities**: Accounts Payable, VAT Payable, Loans
- **Equity**: Share Capital, Retained Earnings
- **Revenue**: Sales Revenue, Other Income
- **Expenses**: COGS, Salaries, Rent, Utilities

### 5.2 Automatic Journal Entries

Every transaction automatically creates journal entries:
- **Sale**: Debit Cash/Receivable · Credit Sales Revenue + VAT Payable
- **Payroll**: Debit Salaries · Credit Cash + Tax Payable
- **Purchase**: Debit Inventory · Credit Accounts Payable

No manual accounting needed for day-to-day operations.

### 5.3 Profit & Loss Statement

1. Go to **Accounting → P&L Statement**
2. Select date range (e.g., May 1–31, 2026)
3. View:
   - **Revenue** — total sales
   - **COGS** — cost of goods sold
   - **Gross Profit** and **Gross Margin %**
   - **Operating Expenses** (salaries, rent, utilities)
   - **Net Profit** and **Net Margin %**
4. Export as PDF or Excel

### 5.4 VAT Filing (ERCA Compliance)

EthioPOS automatically tracks all VAT:

1. Go to **Accounting → VAT Summary**
2. Select the filing period (e.g., May 2026)
3. Review:
   - **Taxable Sales** — sales subject to 15% VAT
   - **VAT Collected** — total VAT received from customers
   - **VAT Payable** — amount to pay to ERCA
4. Click **Generate VAT Report** (PDF for ERCA submission)
5. File by **30th of each month**

> **Important**: The VAT filing reminder notification is sent on the 25th of each month.

### 5.5 Cash Flow Statement

1. Go to **Accounting → Cash Flow**
2. View operating, investing, and financing activities
3. Export for bank or investor review

### 5.6 Adding Expenses

1. Go to **Finance**
2. Click **Add Entry**
3. Select **Expense**
4. Enter description and ETB amount
5. Select category: Utilities, Rent, Transport, Marketing
6. Save — the entry appears in the ledger and P&L automatically

---

## 6. HR & Payroll

### 6.1 Adding an Employee

1. Go to **Employees**
2. Click **+ Add Employee**
3. Fill in:
   - Full name, phone, email
   - Role and branch
   - Basic salary (ETB)
   - Transport allowance (ETB)
   - Hire date
4. Save — employee appears in the payroll module

### 6.2 Attendance Tracking

**Clock in (morning):**
1. Go to **HR & Payroll → Attendance**
2. Find the employee name
3. Click **Clock In**
4. Time is recorded automatically

**Clock out (end of shift):**
1. Same process — click **Clock Out**
2. Hours worked are calculated automatically

### 6.3 Leave Management

**To request leave:**
1. Go to **HR & Payroll → Leave Management**
2. Click **+ New Leave Request**
3. Select employee, leave type, dates, and reason
4. Submit

**Leave types supported:**
- Annual Leave (paid)
- Sick Leave (paid)
- Maternity Leave (98 days paid — Ethiopian Labour Law)
- Unpaid Leave

**To approve leave:**
1. Go to **HR & Payroll → Leave Management**
2. Find the pending request
3. Click **Approve** or **Reject**

### 6.4 Running Payroll

EthioPOS calculates payroll automatically per **Ethiopian Labour Law**:

1. Go to **HR & Payroll → Payroll**
2. Click **Run Payroll** → Select period (e.g., May 2026)
3. Review the payroll table:
   - **Basic Salary** — as set in employee profile
   - **Transport Allowance** — as set in profile
   - **Employee Pension** — 7% of basic salary (automatically deducted)
   - **Employer Pension** — 11% of basic salary (your cost)
   - **Income Tax** — calculated per ERCA progressive brackets
   - **Net Pay** — what employee receives
4. Click **Process Payroll** to mark as paid

### 6.5 Ethiopian Payroll Tax Brackets (2026)

| Monthly Income (ETB) | Tax Rate |
|---|---|
| 0 – 600 | 0% (tax-free) |
| 601 – 1,650 | 10% |
| 1,651 – 3,200 | 15% |
| 3,201 – 5,250 | 20% |
| 5,251 – 7,800 | 25% |
| 7,801 – 10,900 | 30% |
| Above 10,900 | 35% |

### 6.6 Generating Payslips

1. Go to **HR & Payroll → Payslips**
2. Select employee and period
3. Click **Print Payslip** or **Send via WhatsApp**

---

## 7. Invoices & Quotations

### 7.1 Creating a Tax Invoice

1. Go to **Invoices → Tax Invoices**
2. Click **+ New Invoice**
3. Select customer
4. Add products/services with quantities
5. Apply discount if applicable
6. Review VAT (15%) automatically calculated
7. Click **Save & Send** to email invoice, or **Print**

### 7.2 Creating a Quotation

1. Go to **Invoices → Quotations**
2. Click **+ New Quotation**
3. Fill in customer details, products, prices, and validity date
4. Send to customer
5. When customer accepts → click **Convert to Invoice** (1 click)

### 7.3 Credit Notes (Returns)

When a customer returns goods:
1. Go to **Invoices → Credit Notes**
2. Click **+ New Credit Note**
3. Link to original invoice
4. Select returned items and reason
5. Save — inventory is automatically restocked

---

## 8. Warehouse Management

### 8.1 Stock Transfer Between Branches

When a branch is running low, transfer stock from another:

1. Go to **Warehouse → Stock Transfers**
2. Click **+ New Transfer Request**
3. Select: **From Branch** → **To Branch**
4. Select product and quantity
5. Assign driver (optional)
6. Submit — request is sent to the source branch manager

### 8.2 Receiving a Transfer

1. Go to **Warehouse → Stock Transfers**
2. Find the incoming transfer
3. Verify quantity received
4. Click **Confirm Receipt** — stock is added automatically

### 8.3 Inventory Adjustments

For damaged goods, theft, or count discrepancies:
1. Go to **Warehouse → Adjustments**
2. Click **+ New Adjustment**
3. Select product, quantity change (positive or negative), and reason
4. Submit for manager approval
5. Once approved, stock is updated and audit trail is recorded

---

## 9. CRM & Loyalty

### 9.1 Adding a Customer

1. Go to **CRM**
2. Click **+ Add Customer**
3. Enter name, phone, and city
4. Set credit limit if offering credit sales
5. Save — customer is searchable in POS

### 9.2 Loyalty Program

EthioPOS has a built-in loyalty points system:
- **Earning**: 1 point per ETB 10 spent
- **Tiers**:
  - Bronze: 0–1,999 points
  - Silver: 2,000–4,999 points
  - Gold: 5,000–9,999 points
  - Platinum: 10,000+ points

**Tier benefits (customize in Settings):**
- Gold: 10% discount
- Platinum: 15% discount + priority service

### 9.3 Customer Credit Management

1. Go to **CRM → [Customer Name]**
2. View outstanding balance and payment history
3. Click **Record Payment** when customer pays their credit
4. AI Intelligence → Credit Report shows all overdue accounts

---

## 10. AI Intelligence

EthioPOS includes an AI Business Advisor powered by Claude AI. It analyzes your live data and answers business questions.

### 10.1 Pre-Built AI Queries

Click any button for instant analysis:

| Button | What You Get |
|---|---|
| 🏆 Top-Selling Products | Top 3 by revenue, top 3 by profit margin, 3 recommendations |
| 💳 Credit & Debt Report | Risk ranking of customers, collection strategies |
| 📦 Reorder Suggestions | Urgent order list with quantities and ETB costs |
| 💰 Monthly Profit Analysis | P&L assessment, cost reduction opportunities |
| 🔮 Sales Forecast | Next 30 days revenue (3 scenarios), week-by-week |
| 📋 Executive Summary | Full AI business report for owners/investors |

### 10.2 AI Chat

Type any question in the chat box:
- "What are my best-selling products this month?"
- "How much VAT do I owe ERCA?"
- "Which employee sold the most?"
- "Should I increase my Cooking Oil stock?"

**You can also ask in Amharic:**
- "የዚህ ወር ምርጥ ምርቶቼ ምንድናቸው?"
- "ለ ERCA ምን ያህል ቫት እከፍላለሁ?"

### 10.3 AI Forecast

The AI forecasts your next 30 days including:
- Revenue (low / base / high scenarios)
- Cash flow projection
- Inventory purchasing budget
- Branch-level projections

---

## 11. Multi-Branch Management

### 11.1 Switching Branches

Use the **branch selector dropdown** in the top navigation bar. All data (sales, inventory, staff) updates to show the selected branch.

### 11.2 Branch Comparison

1. Go to **Branches**
2. View all branches in a grid with:
   - Revenue, transactions, staff count
   - Online/offline status
3. Click the bar chart for a visual revenue comparison

### 11.3 Consolidated Reports

When you are in the **Bole Main (headquarters)** branch:
- Reports show **consolidated data** across all branches
- Filter by branch in report settings

---

## 12. Reports

### 12.1 Available Reports

| Report | Contents | Format |
|---|---|---|
| Sales Report | Daily/weekly/monthly sales breakdown | PDF, Excel |
| Inventory Report | Stock levels, movement, valuation | PDF, Excel |
| P&L Statement | Revenue, expenses, net profit | PDF, Excel |
| VAT Report | ERCA-compliant VAT filing report | PDF |
| CRM Report | Customer acquisition, retention, LTV | PDF, Excel |
| Branch Report | Multi-branch performance comparison | PDF, Excel |
| Payroll Report | Staff salaries with payslips | PDF, Excel |
| Expense Report | Categorized expenses, budget vs actuals | PDF, Excel |

### 12.2 Generating a Report

1. Go to **Reports**
2. Click the report type you need
3. Select date range
4. Click **PDF** or **Excel**
5. File downloads automatically

---

## 13. Security & User Roles

### 13.1 User Roles & Permissions

| Role | What They Can Access |
|---|---|
| Super Admin | Everything — full system control |
| Business Owner | All modules including billing & security |
| Branch Manager | All operations except billing/security |
| Accountant | Finance, accounting, sales reports, AI |
| Cashier | POS and dashboard only |
| Inventory Manager | Inventory, suppliers, warehouse |
| Sales Manager | Sales, CRM, invoices, AI |
| HR Manager | Employees, payroll, HR |

### 13.2 Adding a New User

1. Go to **Settings → Users** (Owner/Admin only)
2. Click **+ Add User**
3. Enter name, email, phone
4. Assign role and branch
5. Set a temporary password
6. User receives email with login link

### 13.3 Security Best Practices

- Change default passwords immediately after first login
- Enable **MFA** for all owner and manager accounts
- Review the **Audit Log** weekly (Security → Audit Log)
- Never share your PIN with other staff
- Log out when leaving the computer unattended

---

## 14. Amharic Quick Reference (አማርኛ ፈጣን መመሪያ)

### ሽያጭ ማሂደት (Processing a Sale)
1. **ሽያጭ** ሞዱሉ ይክፈቱ
2. ምርቱን ይጫኑ ወይም ባርኮድ ያንብቡ
3. ክፍያ መንገድ ይምረጡ: ጥሬ ገንዘብ / ቴሌብር / CBE ብር / ብድር
4. **ክፍያ ስብሰብ** ቁልፍን ይጫኑ
5. ደረሰኝ ያትሙ

### ዝቅተኛ ቆጠራ ማስጠንቀቂያ (Low Stock Alert)
ምርት ከተቀመጠው ገደብ በታች ሲወርድ ማስጠንቀቂያ ይመጣል።
- ዳሽቦርዱ ላይ ቀይ ማስጠንቀቂያ
- 🔔 የደወል አዶ ላይ ማሳወቂያ

### VAT ሪፖርት ማውጣት (VAT Report)
1. **ሂሳብ አያያዝ → VAT ማጠቃለያ** ይሂዱ
2. ወሩን ይምረጡ
3. **VAT ሪፖርት ፍጠር** ይጫኑ
4. PDF ፋይሉን ያውርዱ — ለ ERCA ያቅርቡ

### ደሞዝ ማሂደት (Payroll Processing)
1. **HR & ደሞዝ → ደሞዝ** ይሂዱ
2. ወሩን ይምረጡ
3. ሂሳቡን ያረጋግጡ (7% ጡረታ + ቀረጥ)
4. **ደሞዝ ሂደት** ይጫኑ

### AI ጥያቄዎች (AI Queries) — በአማርኛ መጠየቅ ይቻላል
- "የዚህ ወር ምርጥ ምርቶቼ ምንድናቸው?"
- "ምን ያህል ቫት ለ ERCA እከፍላለሁ?"
- "ምን ምርቶች ማዘዝ አለብኝ?"
- "ወርሃዊ ትርፌ ምን ያህል ነው?"

---

## 15. Troubleshooting

### Problem: "Cannot connect to server"
**Solution**: EthioPOS works offline. Check:
- Orange "Offline" banner at top of screen
- Continue selling — data saves locally
- When internet returns, data syncs automatically

### Problem: "Payment failed — Telebirr"
**Solution**:
1. Check customer has enough Telebirr balance
2. Verify phone number format: 09xxxxxxxx
3. Try again — Telebirr sometimes has brief outages
4. Switch to Cash or CBE Birr as backup

### Problem: "Product not found" when scanning barcode
**Solution**:
1. Check product is added in Inventory
2. Verify the barcode is linked to the correct product
3. Try searching by product name instead
4. Add a new product if it doesn't exist

### Problem: "Stock shows as negative"
**Solution**:
1. Go to **Warehouse → Adjustments**
2. Add a positive adjustment to correct the count
3. Investigate cause: missed receiving, returns not recorded

### Problem: "VAT calculation seems wrong"
**Solution**:
- EthioPOS uses 15% VAT on subtotal (ERCA rate)
- Formula: VAT = Subtotal × 0.15 · Total = Subtotal + VAT
- All VAT-applicable products are taxed automatically
- Contact support if a product should be VAT-exempt

### Problem: "Cannot log in — forgot password"
**Solution**:
1. Click **Forgot Password** on the login screen
2. Enter your email or phone number
3. You will receive an OTP via SMS
4. Enter OTP → set new password
5. Contact your admin if you don't receive the SMS

### Problem: Slow loading
**Solution**:
1. Check internet speed (minimum 512 Kbps)
2. Clear browser cache (Ctrl+Shift+Delete)
3. Use Google Chrome for best performance
4. Dashboard loads in under 2 seconds on good connection

---

## Contact & Support

| Channel | Contact | Hours |
|---|---|---|
| 📧 Email | support@ethiopos.et | 24/7 response within 24h |
| 📞 Phone | +251 115 570 000 | Mon–Sat, 8AM–6PM EAT |
| 💬 WhatsApp | +251 911 570 000 | Mon–Sat, 8AM–8PM EAT |
| 🌐 Help Center | help.ethiopos.et | 24/7 self-service |

---

*EthioPOS User Manual v1.0 · © 2026 EthioPOS Technology PLC · Addis Ababa, Ethiopia*
*ame·segenaw for choosing EthioPOS! · አመሰግናለሁ EthioPOS ስለመረጡ!*
