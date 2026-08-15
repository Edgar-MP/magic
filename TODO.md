# Plantillas de carta que faltan

Ya hechas: normal/tierra básica, **planeswalker** (marco, lealtad y
habilidades), **saga** (marco, capítulos y numerales romanos) y **battle**
(marco apaisado, texto de reglas normal y casillas de defensa — sólo la cara
frontal; la trasera es una carta normal aparte y queda pendiente como parte
de Transform/DFC más abajo).

Quedan estas plantillas propias (cada una es prácticamente un editor nuevo:
sprites + estructura de datos + layout de render):

1. **Class** — niveles con coste de mejora, tipo escalera (como Saga pero vertical).
2. **Adventure** — dos hechizos en una sola carta (mitad conjuro + mitad criatura).
3. **Split card** — dos cartas completas lado a lado (fuse).
4. **Flip card** (Kamigawa clásico) — la misma carta boca abajo es otra.
5. **Transform / doble cara** (DFC) — frente normal, dorso distinto. Incluye la
   cara trasera de Battle, que hoy no se cubre.
6. **Meld** — dos cartas que se combinan en una tercera más grande.
7. **Case** (Duskmourn) — como Saga pero con una "solución" en vez de capítulos.
8. **Vanguard / Plane / Scheme / Contraption** — formatos especiales, de nicho.

De todas, la que más se juega es Transform/DFC; el resto es más de nicho.

Los sprites de todas salen de la misma fuente que ya se usa
(`fiahdrgn473/CardConjurer`, vía `scripts/fetch-assets.ts`).
