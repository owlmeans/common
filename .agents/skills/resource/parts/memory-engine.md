---
name: memory-engine
description: recordQueryHelper, the shared in-memory engine every store without a query engine of its own filters, sorts and pages through.
metadata:
  purposes: test
  mentions: recordQueryHelper, matchCriteria, filterRecords, sortRecords, firstMatch, applyQuery
---

# @owlmeans/resource — The shared in-memory engine

## The shared in-memory engine

Every store without a query engine of its own — redis after its SCAN, the client and static stores,
state — filters through the same helper, `recordQueryHelper`, so a criteria object written for an
endpoint selects the same records when a screen applies it locally:

| Member | Answers |
|---|---|
| `recordQueryHelper.matchCriteria(record, where)` | does this one record match |
| `recordQueryHelper.filterRecords(records, where)` | every match, in insertion order |
| `recordQueryHelper.sortRecords(records, sort)` | a sorted copy |
| `recordQueryHelper.firstMatch(records, where, { sort })` | the record `load(where)` / `get(where)` return |
| `recordQueryHelper.applyQuery(records, where, opts)` | the whole `ListResult` — filter, sort and page in one call |

Reach for them when implementing a backend, and when narrowing a list already in hand rather than
going back to the store.
