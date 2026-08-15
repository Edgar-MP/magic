# Plantillas de carta

Hechas de punta a punta (render, import de Scryfall, tests): normal/tierra
básica, **planeswalker**, **saga**, **battle** (solo cara frontal), **class**,
**adventure**, doble cara/**transform** (`backFaceId`/`isBackFace`), **split**
(`splitPartnerId`/`isSplitPartner`) y **flip** (`flipPartnerId`/`isFlipPartner`).

**Solo Planeswalker está visible en el editor.** El resto está implementado
pero oculto a propósito (`SHOW_HIDDEN_LAYOUTS = false` en
`packages/web/src/routes/ProxyEditor.tsx`) — se van a ir activando uno a uno
a mano. Para activar una:
- Saga/Battle/Class: descomentar su `<Toggle>` en la sección "Marco".
- Doble cara/Split/Flip/Adventure: poner `SHOW_HIDDEN_LAYOUTS = true` (activa
  las cuatro secciones de golpe; si se quiere una a una, separar el flag).

Quedan sin implementar (nicho, no urgen):

1. **Meld** — dos cartas que se combinan en una tercera más grande.
2. **Case** (Duskmourn) — como Saga pero con una "solución" en vez de capítulos.
3. **Vanguard / Plane / Scheme / Contraption** — formatos especiales, no se
   juegan con mazos normales.

Los sprites de todas salen de la misma fuente que ya se usa
(`fiahdrgn473/CardConjurer`, vía `scripts/fetch-assets.ts`).
