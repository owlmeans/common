---
name: schemas
description: Data-defined card types and flows — the resolved layer per organization and project, the facade's definitions, retiring a flow.
metadata:
  purposes: data, planning, config
  mentions: makeDefinitions, makeSchemaViews, schemasFor, scopedSchemaHelper, definitions, SchemaInUse
---

# @owlmeans/server-planning — Data-defined types and flows

## Data-defined types and flows

Where the default store has the schema port, `runtime.schemasFor(entityId, project?)` answers the
resolved layer (`scopedSchemaHelper.resolveScopedBundle` over the code bundle and the organization's and project's
records), cached per (organization, project) and keyed by the store's `revision()` and the plugin
registry's version — a write anywhere moves the revision the next lookup reads, so a cached layer is
never stale; a store's `watch` evicts early. Without the port it answers the code registry itself.
`makeDefinitions` gives the facade `definitions`: every write checks the project (a project card the
scope can see), the seal, the closed-form checks (a type's flows resolve in its layer, counting flows
written beside it; a type's and a flow's `app` bag against the code registry's `app()`), then the
store's compare-and-set. A layer's registry carries the code declarations, so a data-defined card
type validates the app's base card fields too. `retire` of a flow refuses with `SchemaInUse`
while a live type of the layer — or of any project layer, for an organization record — still runs
it. `facade.model(card)` builds over the layer of the card's own project, and `schema.list` answers
the scoped bundle (`?project=`) where `definitions` exists, the code bundle otherwise.
