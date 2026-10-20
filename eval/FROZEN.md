# Frozen final round

`businesses-10.json` is the frozen final round, recorded 2026-10-20, to run once at code freeze (28 Oct).
Whatever that single run returns is published as is.

This list was committed on 2026-10-20 before the final run; the test checks the hash
(`tests/frozen-list.test.mjs`). Any edit to the list, even a space, makes the test fail.

- File: `eval/businesses-10.json` (12 businesses, none seen in an earlier list)
- Mix: 2 name + domain, 2 name + city, 8 name only; 5 sellers without a website of their own (Shopier),
  namesake traps (Vanessa Collection, Takık Jewelry / takik.com, Solivagant / solivagant.net, Babil Takı),
  addresses that differ from the name (Nesli Nur Moda / asilnurmoda.com, ZES Şal Eşarp Çanta / zessalesarp.com)
- Source: Saker notes (Kestly list 14 Oct, Shopier hunt 16 Oct); pre-checks with curl and dig on 2026-10-20,
  no Proofline, search or model calls
- Recorded: 2026-10-20

SHA-256: 573d583ae2a575df7629642146ab22477780a673efb4d6f8558eba04693239b9
