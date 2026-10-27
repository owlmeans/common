---
name: permissions
description: Permission names and grant forms, IamGrantMode, the four permission kinds, default classes and restrictions.
metadata:
  purposes: auth
  mentions: hasPermission, grantPermission, revokePermission, ensurePermission, IamGrantMode, IamDefaultClass, composePermissionName, parsePermissionName, entityScoped, resourceScoped, defaultClass
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/iam — Permission model

## Permission model (kinds and grant forms)

Permissions are declared per entity client (project) with `ensurePermission` and granted to end-user
subjects with `grantPermission`:

- **Unscoped (project-wide)**: `grantPermission(entityId, clientId, profileId, 'article--modify')`
- **Resource-scoped**: `grantPermission(entityId, clientId, profileId, 'department--modify', { resources: ['dep-123'] })` —
  the grant only applies to the listed resource ids.

Grants materialize as OwlMeans `PermissionSet[]` (`scope` = clientId; resource-scoped grants live in a
dedicated set per permission carrying `resources[]`, because `resources` applies to all keys of a set).

A **name** is `<resource>--<action>`, with two hyphens. One hyphen is not a separator: `enquiry-view`
is a resource named `enquiry-view` with no action, and it must keep parsing that way, because a name
already granted somewhere cannot be reinterpreted without orphaning the grant. Build and read names
through `composePermissionName` / `parsePermissionName` rather than splitting strings.

`resourceScoped: true` says a permission *may* be bound to resource ids, not that it must be. The
same name is grantable in both forms and they are stored separately, which is what `IamGrantMode`
addresses: `Blanket` is the set carrying no `resources` (and `hasPermission` reads it as covering
every id), `Resources` is an explicit id list, `All` (revoke-only) is every form, and `Inherit`
(revoke-only) is the subject's own blanket value — see "Restrictions". A grant in `All` or `Inherit`
is refused (`IamGrantError('mode:all-is-revoke-only')`, `'mode:inherit-is-revoke-only'`). The
defaults are asymmetric on purpose — `grantPermission` defaults to `Blanket`, `revokePermission` to
`All`, because a bare revoke has always meant "remove it everywhere". Pass `mode` explicitly rather
than relying on either.

`area` is a presentational grouping tag (`IAM_AREAS`, or any string a deployment defines) and decides
nothing at request time. `managed: true` marks a definition the platform owns: an operator cannot
revoke it from an undifferentiated list, and a repair that deletes "definitions no declaration names"
must not reach one.

### Permission kinds

What a grant binds to is a property of the DEFINITION, and grants follow it:

| Kind | Definition flags | Grant stored on | Applies |
|---|---|---|---|
| unbound | none | the subject's primary row, or a group | everywhere |
| entity-bound | `entityScoped` | the subject's row of THAT organization, or a group of it | only while acting in that organization |
| resource-bound | `resourceScoped` | the primary row, a titled set with `resources` | to those resource ids |
| both | both | that organization's row, a titled set with `resources` | both checks |

- Granting an `entityScoped` definition REQUIRES `args.entitySlug`, which names the subject's row
  there — the subject must be a member. Any other definition refuses `args.entitySlug`. Turning
  `entityScoped` off while grants exist is refused: every bound grant would silently widen.
- Stored sets carry the organization's id; CLAIM sets (provider → relying party only) carry its
  `entitySlug` instead (`OidcPermissionSetClaim`). The relying party keeps the unbound sets and the
  acting organization's, strips the binding, and drops the rest — a browser token never carries a
  bound set of another organization.
- `hasPermission(auth, name, { entitySlug })` applies a set without `entitySlug` everywhere and a
  bound one only when `opts.entitySlug` names its organization — fail-closed, so a bound set that
  leaked into a token never counts where the caller named no organization.

### Default classes

`defaultClass` says who holds a definition without an explicit grant. It is evaluated when claims and
grant listings are built — never written onto a row:

- `User` — every signed-in subject of the client. Requires an unbound, unmanaged `user`-area definition.
- `Member` / `Owner` — every member / owner of the organization the subject acts in. Requires
  `entityScoped`.
- `None` — nobody.

A class default is a BLANKET set, so `Owner` on a resource-scoped definition is its all-records form.
A listing marks each grant's `origin`: `Direct`, `Default`, or `Group` with `through` naming the
group. A backend that cannot evaluate classes (Keycloak) refuses any `defaultClass` other than
`None` with `IamUnsupported`.

### Restrictions

Every subject — a person or a group — has ONE blanket value of its own per binding: `true` grants,
`false` RESTRICTS, absent inherits. A subject holds a name when its own value is `true`, or when it is
not `false` and something it inherits grants it.

| Subject | Inherits from | Its own value lives on |
|---|---|---|
| person | class defaults, its groups' grants and its groups' bundles | the primary row (unbound definition); the row of the binding's organization (bound — for a group-derived name, the row that names the group) |
| group | its bundles | the group's own blanket set |

- A restriction withholds every INHERITED form of the name in that binding — a class default, a
  group's blanket grant, a group's per-record grant, a bundle's selection. The subject's OWN grants,
  per-record ones included, are never cut. A group's restriction cuts only its own bundles, for all
  its members; another group granting the name still grants it.
- A `Blanket` or `All` revoke of a DECLARED definition writes the restriction (an undeclared name gets
  none). `Inherit` drops the subject's own value — grant or restriction — writes nothing in its
  place, leaves resource-scoped sets alone and ignores `resources`; a bound definition needs
  `entitySlug` for it as for `Blanket`. A later `Blanket` grant overwrites a restriction with `true`.
- Tokens carry only what is held: a relying party never sees a restriction, only fewer permissions.
- Listings (`listGrants`, `groups.grants`) answer what is held; `IamGrantListArgs.restricted` adds
  the inherited grants the subject's own restriction withholds as `restricted: true` (same `origin` /
  `through` as the held form), so a console can show them and lift them with `Inherit`. A user's
  `grantCount` counts held grants only.
- A backend without inheritance (Keycloak) has nothing to restrict: every revoke, `Inherit`
  included, removes the role, and a listing ignores `restricted`.
