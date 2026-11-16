# MenuGo — Correccion conjunta de CI/CD y Render

## Problema confirmado

El commit `0ea4dfa` de `main` contiene dos problemas independientes:

1. `Frontend/js/cocina.js`: GitHub Actions falla con `SyntaxError: Identifier 'pedidosFiltrados' has already been declared` (linea aproximada 167). Al corregirlo aparecen otros fragmentos de una funcion huerfana y un segundo `renderPedido` pegado en el primero.
2. `backend/src/routes/cajero.routes.js`: Render falla en el arranque con `ReferenceError: ticketController is not defined` al registrar `GET /pagos/:id/ticket.pdf`.

La Pull Request #11 ya fue **fusionada**, por lo que este arreglo debe publicarse en una **rama nueva**, basada en `main`, y una PR nueva.

## Que incluye este paquete

- `tools/aplicar_correccion_ci_render.cjs`: reparador seguro para los dos archivos existentes, sin sobrescribir otras funciones de Cocina ni Caja. El reparador valida los cambios antes de escribirlos y genera copias de seguridad en el directorio temporal del sistema.
- `backend/test/ci.render.regresion.test.cjs`: tres pruebas para detectar la sintaxis rota del frontend, evaluar las rutas Express (no basta `node --check`) y comprobar que sigan existiendo las rutas de turnos y movimientos.
- `docs/FIX_CI_RENDER_COCINA_TICKETS.md`: este procedimiento.

No hay migraciones de Neon ni cambios a tablas de pagos.

## 1. Crear la rama nueva

Desde la raiz de MenuGo, con la carpeta de trabajo limpia (revisa primero `git status`):

```bash
git switch main
git pull --ff-only origin main
git switch -c fix/ci-render-cocina-ticket
```

**No** crees la rama si tienes cambios locales sin guardar. Confirma o guarda esos cambios antes de cambiar de rama.

## 2. Aplicar el reparador

Descomprime el ZIP en la raiz del repositorio. Debes ver `tools/`, `backend/test/` y `docs/` dentro de MenuGo. El ZIP **no sobrescribe** directamente tus archivos de Cocina y Cajero; el script los edita al ejecutarlo, para respetar tu copia de `main`.

```bash
node tools/aplicar_correccion_ci_render.cjs
```

El reparador modifica **solo** estos archivos:

- `Frontend/js/cocina.js`
- `backend/src/routes/cajero.routes.js`

Si la estructura del proyecto cambió o el script detecta código distinto de la versión revisada, se detendrá sin sobrescribir los archivos. No lo fuerces: revisa el diff o solicita ayuda con el error completo.

Puedes repetir el comando: al estar corregido, debe indicar que los cambios ya estaban aplicados.

## 3. Verificar antes de hacer commit

```bash
node --check Frontend/js/cocina.js
node --check backend/src/controllers/cocina.controller.js
node --check backend/src/routes/cajero.routes.js
node --test backend/test/ci.render.regresion.test.cjs
node --test backend/test/*.test.cjs
git diff --check
git status
```

Para verificar la carga real del modulo de rutas (requiere las dependencias del backend instaladas):

```bash
node -e "require('./backend/src/routes/cajero.routes.js'); console.log('Rutas Cajero: OK')"
```

Un resultado correcto en esta prueba demuestra que las rutas se pueden cargar, pero no garantiza que Render pueda conectarse a Neon o que todos los endpoints respondan en produccion.

## 4. Publicar una sola correccion

Si todo esta correcto:

```bash
git add Frontend/js/cocina.js backend/src/routes/cajero.routes.js
git add backend/test/ci.render.regresion.test.cjs docs/FIX_CI_RENDER_COCINA_TICKETS.md
git commit -m "fix(ci): reparar cocina y carga de tickets en Render"
git push -u origin fix/ci-render-cocina-ticket
```

`tools/aplicar_correccion_ci_render.cjs` es una herramienta auxiliar para preparar los cambios; puedes conservarla localmente o subirla si tu equipo desea registrar tambien el proceso. Los cuatro archivos anteriores son suficientes para la correccion y sus pruebas.

Crea una PR con `base: main` y `compare: fix/ci-render-cocina-ticket`, revisa los cambios, comprueba GitHub Actions en verde y realiza el merge siguiendo el Ruleset de tu equipo.

## 5. Desplegar en Render

Solo despues del merge a `main`, abre el servicio `menugo-backend` en Render y ejecuta **Manual Deploy > Deploy latest commit** si no se despliega automaticamente.

Confirma que Render muestre `Live` en el commit nuevo. Comprueba `/api/health` y vuelve al modulo Cajero para probar **Mi turno de caja -> Abrir mi turno**. Para operaciones de turno, entra con una sesion real de Cajero; la ruta esta protegida por JWT.

## Nota sobre vulnerabilidades

El aviso de `npm audit` sobre dependencias no es el causante del error de arranque mostrado. Conviene revisarlo en un trabajo posterior y no ejecutar `npm audit fix` indiscriminadamente durante esta correccion porque podria cambiar dependencias y generar otro fallo.
