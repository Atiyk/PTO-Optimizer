# Payout law — official-source research notes (not an executable registry)

**Reviewed:** 2026-11-02 (UTC). **Status:** preliminary primary-source review for future independent legal critic.  
**Do not turn these notes into a legal payout decision or claim full jurisdiction coverage.** `payoutEstimate.ts` deliberately leaves all legal fields `not-verified` and all mandatory amounts `null`.

## California, United States — agency guidance

- **Official source:** California Division of Labor Standards Enforcement, [Vacation FAQ](https://www.dir.ca.gov/dlse/faq_vacation.htm), especially introductory guidance and questions 2, 5 and 10; cites Labor Code §227.3 and relevant cases. Accessed 2026-11-02.
- **Agency position:** California does not require employers to offer paid vacation. Where paid vacation is earned, the agency treats it as vested wages; accrued unused vacation generally must be paid on separation at the employee's final rate, subject to collective-bargaining considerations. A reasonable accrual cap differs from forfeiture of earned vacation. The FAQ says termination accrual must be prorated on a **daily basis** even where the employer's ordinary accrual cadence is periodic.
- **Important engineering gap:** The current shared policy projection credits leave on configured pay dates. That is appropriate for a **company-policy what-if** but may **not** equal the California separation accrual method. Never label the present output a California mandatory minimum; legal mode needs a separate, independently tested daily separation-proration trace, correct effective-date applicability, collective-bargaining exceptions and final-rate inputs.
- **Still to verify:** statutory current text/versions; which PTO categories legally qualify as vacation; collective bargaining, unlimited leave, paid sick leave, cashout and wage-base nuances; time of payment and rounding. Do not infer treatment of sick leave.

## New York, United States — conditional policy and forfeiture

- **Official sources:** New York State Department of Labor [Wages and Hours FAQ](https://dol.ny.gov/node/6461) and [Unpaid/Withheld Wages and Wage Supplements](https://dol.ny.gov/unpaidwithheld-wages-and-wage-supplements). Accessed 2026-11-02.
- **Agency position:** Vacation payout at resignation/discharge depends on the terms of the employer's vacation/resignation policy. The agency describes written notice of conditions nullifying earned benefits and explains that where earned vacation exists **without a written forfeiture policy**, accrued vacation must be paid. Promised wage supplements may be enforceable.
- **Important engineering gap:** A simple `pays-none` or `pays-all` employer toggle cannot independently determine a New York legal entitlement. A future jurisdiction mode needs evidence of employer policy terms, forfeiture notice and the worker's accrual, with explicit unknowns when those facts are absent.
- **Still to verify:** applicable collective bargaining, coverage and employment-category exceptions, current regulations/cases and sick/personal leave treatment. Do not hard-code New York as unconditional yes or no.

## United Kingdom — statutory versus contractual holiday

- **Official sources:** [GOV.UK: Taking holiday before leaving a job](https://www.gov.uk/holiday-entitlement-rights/taking-holiday-before-leaving-a-job); [GOV.UK: Holiday pay](https://www.gov.uk/holiday-entitlement-rights/holiday-pay); [Working Time Regulations 1998, regulation 14 (current text)](https://www.legislation.gov.uk/uksi/1998/1833/regulation/14). Accessed 2026-11-02.
- **Government guidance:** Payment in lieu of **untaken statutory leave** is required when employment ends, including gross misconduct; contractual leave above the statutory amount may have separate agreed arrangements. The Regulations' termination calculation is linked to the proportion of leave year elapsed, leave taken, and relevant agreement/pay rules. Holiday pay can depend on pay type, regular overtime, commission and the 52-week reference period; a flat annual-salary/annual-hours conversion is not universally the statutory method.
- **Important engineering gap:** Current company-policy gross math does not calculate statutory UK leave entitlement or the appropriate reference-period pay. Do not use it as a UK legal baseline.
- **Still to verify:** territorial extent (especially Northern Ireland), worker classification, irregular-hours/part-year changes and effective dates, statutory versus additional contractual leave, carry-forward rules and individual pay basis.

## Cross-jurisdiction acceptance gates before shipping law mode

1. Versioned registry with `jurisdiction`, `leaveCategory`, `effectiveFrom`, `reviewedAt`, `officialSourceUrls`, explicit applicability/exception fields and `unknown` state.
2. Independent legal critic cross-checks current agency guidance **and** current statutory text, with a documented counterexample for each conditional rule.
3. Legal and company-policy results must be separate. The UI must disclose unsupported jurisdiction, missing facts and divergence without promising a dispute outcome.
4. Unit tests cover partial separation accrual, separation type, vacation vs sick, union exceptions, carryover, final pay rate, calendar-year versus anniversary year and gross-only results.
5. No primary-source snippet alone authorizes a broad jurisdiction coverage claim; every legally consequential branch needs verification.

**Scope of this memo:** research for implementation planning, not legal advice. Nothing in this memo changes the product's currently supported jurisdictions or releases.
