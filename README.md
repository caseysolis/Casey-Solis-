# Forensic Economic Loss Calculator

A self-contained, single-file web calculator for estimating economic damages
in personal injury, wrongful death, and wrongful termination matters, using
standard forensic economics conventions.

## Usage

Open `index.html` in any browser — no build step, server, or dependencies required.

1. Enter case information (case type, date of loss, evaluation date).
2. Enter the individual's date of birth and choose how the loss period is
   determined (to a retirement age, or a fixed number of worklife years).
3. Enter earnings assumptions: base annual earnings at date of loss, annual
   wage growth rate, fringe benefit rate, and the discount rate used to
   present-value future losses.
4. For **Personal Injury** cases with partial disability, enter residual
   post-injury earning capacity.
5. For **Wrongful Death** cases, enter the personal consumption rate (the
   portion of earnings the decedent would have spent on themselves, which
   is excluded from the loss to survivors).
6. Click **Calculate Loss** to generate summary totals and a year-by-year
   schedule. Use **Print / Save PDF** to export a clean report.

## Methodology

- **Loss period**: date of loss through retirement age (computed from date
  of birth) or a fixed worklife-years figure.
- **Annual compensation**: base earnings grown annually at the wage growth
  rate, plus fringe benefits as a percentage of gross wages.
- **Personal Injury**: residual post-injury earning capacity (grown at the
  same rate) is subtracted from total compensation each year.
- **Wrongful Death**: total compensation is reduced by the personal
  consumption rate to isolate the loss to survivors/dependents.
- **Past loss**: the portion of each annual period before the evaluation
  date is summed at nominal value, optionally compounded to the evaluation
  date at a prejudgment interest rate.
- **Future loss**: the portion of each annual period after the evaluation
  date is discounted to present value at the evaluation date using the
  mid-period discounting convention.
- **Total Economic Loss** = Past Loss + Present Value of Future Loss.

## Disclaimer

This tool is intended for preliminary estimation and educational purposes.
It does not incorporate jurisdiction-specific worklife/mortality tables
(e.g., Skoog-Ciecka, BLS worklife tables), tax-effect adjustments, or
case-specific facts that a qualified forensic economist would apply. It is
not a substitute for a full forensic economic analysis and should not be
relied upon as the sole basis for a report, settlement negotiation, or
expert testimony.
