# APPA al Día

App ciudadana (PWA) de seguimiento a la derogatoria de las Áreas de Protección para la Producción de Alimentos (APPA) en Colombia.
Desarrollada por Vibras Positivas HM.

## Archivos
- `index.html` — la app completa.
- `noticias.json` — noticias y videos reales (los actualiza el robot).
- `robot/actualizar.mjs` — robot que busca noticias, fotos y videos.
- `.github/workflows/robot.yml` — corre el robot cada 30 minutos.
- `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` — para instalarla en el celular.

## Publicar
1. Crear el repo `haroldco45/appa-al-dia` y subir todos los archivos (incluida la carpeta `.github`).
2. Settings → Pages → Deploy from branch → `main` / root.
3. Settings → Actions → General → Workflow permissions → **Read and write**.
4. Actions → "Robot de noticias APPA" → **Run workflow** para la primera corrida.
5. Conectar el repo en Netlify (se actualiza solo con cada commit del robot).

## Cuando cambie el estado de una región
En `index.html`, arreglo `REGIONES`: cambiar `estado` a `derogada`, `vigente` o `proceso`, y la `fecha`.
Si se deroga otra región, actualizar también las cifras de la sección Hoy (`data-contar` y la barra) y `ULTIMA_DEROGATORIA`.
