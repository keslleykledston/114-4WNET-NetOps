# v0.3.4 UX Feedback Checklist

**Date:** 2026-05-22  
**Audience:** NOC operators performing pilot  
**Instructions:** Rate each item 1-5 (1=poor, 5=excellent), add notes

---

## Performance

- [ ] **Device list loads in < 3 sec** (1-5 rating: __)
  - Notes: ___

- [ ] **Device detail loads in < 2 sec** (1-5 rating: __)
  - Notes: ___

- [ ] **Compliance page filters responsive** (1-5 rating: __)
  - Notes: ___

- [ ] **Report download completes in < 10 sec** (1-5 rating: __)
  - Notes: ___

- [ ] **Audit log search returns results quickly** (1-5 rating: __)
  - Notes: ___

---

## Clarity & Labeling

- [ ] **"Test Connectivity" button purpose is clear** (1-5 rating: __)
  - Notes: ___

- [ ] **"Start Discovery" button vs "Refresh Discovery" is clear** (1-5 rating: __)
  - Notes: ___

- [ ] **Finding severity badges (critical/high/medium/low) are obvious** (1-5 rating: __)
  - Notes: ___

- [ ] **"Actionable Only" filter purpose is clear** (1-5 rating: __)
  - Notes: ___

- [ ] **Status colors (green=ok, red=error, orange=warning) are intuitive** (1-5 rating: __)
  - Notes: ___

- [ ] **"Freshness" column and stale vs fresh badges understood** (1-5 rating: __)
  - Notes: ___

- [ ] **"Source" column and SSH vs SNMP distinction clear** (1-5 rating: __)
  - Notes: ___

- [ ] **"Confidence" level (high/medium/low) purpose understood** (1-5 rating: __)
  - Notes: ___

---

## Filtering & Discovery

- [ ] **Filter dropdown by severity is intuitive** (1-5 rating: __)
  - Notes: ___

- [ ] **Filter dropdown by status (pass/fail) works as expected** (1-5 rating: __)
  - Notes: ___

- [ ] **Sort by column (click header) is obvious** (1-5 rating: __)
  - Notes: ___

- [ ] **Search by hostname works across pages** (1-5 rating: __)
  - Notes: ___

- [ ] **Pagination (if exists) is clear** (1-5 rating: __)
  - Notes: ___

---

## Action Workflows

### Device Connection Testing

- [ ] **Finding "Test Connectivity" button is easy** (1-5 rating: __)
  - Notes: ___

- [ ] **Result (success/failure) is obvious** (1-5 rating: __)
  - Notes: ___

- [ ] **Error message explains why it failed** (1-5 rating: __)
  - Notes: ___

### Running Discovery

- [ ] **Button to start discovery is visible** (1-5 rating: __)
  - Notes: ___

- [ ] **Progress indicator shows during discovery** (1-5 rating: __)
  - Notes: ___

- [ ] **Completed discovery populates interface/BGP/VLAN data visibly** (1-5 rating: __)
  - Notes: ___

### Viewing BGP Peers

- [ ] **BGP section easy to find in device detail** (1-5 rating: __)
  - Notes: ___

- [ ] **Peer list shows status (up/down) obviously** (1-5 rating: __)
  - Notes: ___

- [ ] **"Prefixes" button for route query is obvious** (1-5 rating: __)
  - Notes: ___

### Downloading Reports

- [ ] **Download button location is clear** (1-5 rating: __)
  - Notes: ___

- [ ] **Format selector (markdown/json/csv) is intuitive** (1-5 rating: __)
  - Notes: ___

- [ ] **Downloaded file name is useful** (1-5 rating: __)
  - Notes: ___

- [ ] **Markdown report format is readable** (1-5 rating: __)
  - Notes: ___

- [ ] **CSV export can be opened in Excel/Sheets** (1-5 rating: __)
  - Notes: ___

---

## Information Presentation

- [ ] **Device detail shows critical info first (hostname, status, role)** (1-5 rating: __)
  - Notes: ___

- [ ] **Finding details panel shows enough context** (1-5 rating: __)
  - Notes: ___

- [ ] **Evidence section useful and not overwhelming** (1-5 rating: __)
  - Notes: ___

- [ ] **Compliance summary (pass/fail counts) is prominent** (1-5 rating: __)
  - Notes: ___

---

## Domain Knowledge Questions

### Freshness

- [ ] **Operator understands "fresh" vs "stale" finding** (Yes/No)
  - If no, what's confusing? ___

- [ ] **Operator knows why freshness matters** (Yes/No)
  - If no, what would help? ___

### Source & Confidence

- [ ] **Operator understands "SSH" vs "SNMP" source** (Yes/No)
  - If no, what's confusing? ___

- [ ] **Operator understands confidence (high/medium/low)** (Yes/No)
  - If no, what would help? ___

### Compliance Profiles

- [ ] **Operator understands difference: strict vs balanced vs observe-only** (Yes/No)
  - If no, explain: ___

- [ ] **Operator knows which profile to use for daily checks** (Yes/No)
  - If no, what guidance needed? ___

---

## Pain Points

### Rate each pain point's severity (1-5: 1=minor, 5=show-stopper)

- [ ] **Finding something takes too many clicks** (1-5: __)
  - Specific example: ___

- [ ] **Page UI is cluttered/confusing** (1-5: __)
  - Where? ___

- [ ] **Buttons/links not where expected** (1-5: __)
  - Examples: ___

- [ ] **Error messages unhelpful** (1-5: __)
  - Specific error: ___

- [ ] **No way to do X (important action)** (1-5: __)
  - What is X? ___

- [ ] **Data presentation hard to scan** (1-5: __)
  - Which page? ___

---

## Suggestions for Improvement

### Quick Wins (< 1 day effort)

- [ ] ___
- [ ] ___
- [ ] ___

### Medium Effort (1-3 days)

- [ ] ___
- [ ] ___

### Nice-to-Have (future)

- [ ] ___
- [ ] ___

---

## Feature Requests

- [ ] Alert notification when device goes offline?
- [ ] Email digest of findings?
- [ ] Bulk action (apply same action to multiple findings)?
- [ ] Custom dashboard?
- [ ] Dark mode?
- [ ] Mobile app?
- [ ] Integration with ticketing system?
- [ ] Other: ___

---

## Overall Satisfaction

**Overall, how satisfied are you with NetOps Manager for NOC operations?**

1. ⭐ Not ready for production
2. ⭐⭐ Has blockers, needs fixes
3. ⭐⭐⭐ Usable but rough around edges
4. ⭐⭐⭐⭐ Good, minor polish needed
5. ⭐⭐⭐⭐⭐ Excellent, production-ready

**Rating:** __ out of 5

**Why?** ___

---

## Would you recommend to another NOC?

- [ ] Yes, today
- [ ] Yes, after a few improvements
- [ ] Maybe, needs more work
- [ ] No, not ready

---

## Additional Comments

(Use this space for any other feedback not covered above)

___

---

**Operator Name:** ___  
**Date:** ___  
**Experience Level:** [ ] New  [ ] < 1 year  [ ] 1-3 years  [ ] 3+ years  
**Primary Role:** [ ] Network Ops  [ ] Monitoring  [ ] Incident Response  [ ] Other: ___

Thank you for your feedback! This will help us improve v0.3.5 and beyond.
