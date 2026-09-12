# Tienda local Piuma

La rama `tienda-local` reúne la interfaz de comercio para probar con el backend Docker. No se fusiona con `main` ni cambia la landing publicada en Vercel en esta etapa.

El código de API, autenticación, datos, Terraform, pruebas de punta a punta y empaquetado se encuentra exclusivamente en [piuma-backend](https://github.com/piuma-uy/piuma-backend).

Para Windows, utilizar el ZIP completo `piuma-cliente.zip` preparado desde el backend: extraer todo, abrir Docker Desktop y hacer doble clic en `iniciar.cmd` en la carpeta principal. Abrir `ABRIR-MANUAL.html` para instrucciones de comprador y administrador. Los dos repositorios deben permanecer como carpetas hermanas.

Si se prepara desde Git:

```powershell
git clone --branch tienda-local https://github.com/piuma-uy/landing.git
git clone https://github.com/piuma-uy/piuma-backend.git
cd piuma-backend
docker compose -f compose.dev.yaml up -d --build
```

Abrir http://localhost:4200. Docker monta la configuración local para activar el comercio; el archivo público de este repositorio lo deja deshabilitado por defecto.

El menú principal contiene Catálogo, cuenta, carrito y, cuando corresponde, Administrar. El comprador encuentra sus pedidos dentro de Mi cuenta. El administrador ve resumen y stock agrupado por producto, sin secciones de pedidos. Cada medida/color conserva su identificador, precio y stock independiente. Sobre nosotros y Contacto permanecen al pie de página.

Los pedidos quedan pendientes y no hay cobros. Google, pasarela y conexión Cognito/AWS siguen pendientes. El acceso local no reemplaza la configuración de autenticación para producción.
