# Acceso de administrador con Google y recuperación de contraseña

## Alcance

- Google solo inicia sesión con el correo exacto definido en `ADMIN_GOOGLE_EMAIL`; además, ese correo debe estar verificado por Google y registrado en una fila activa de `administrador.correo`.
- No se crea una cuenta administrativa pública desde la pantalla de acceso.
- El código de recuperación vence en 10 minutos, admite hasta 5 intentos y se envía una vez por minuto como máximo a cada cuenta.
- La recuperación permite establecer una contraseña nueva. No envía contraseñas temporales.
- Al cambiar la contraseña, se invalidan las sesiones previas de esa cuenta.

## Preparación de Google

1. Crea un cliente OAuth de tipo **Aplicación web** en Google Cloud Console.
2. Añade como origen autorizado la URL del frontend. Para desarrollo, agrega el origen exacto que use Live Server, por ejemplo `http://127.0.0.1:5500`.
3. Copia el ID de cliente en `GOOGLE_CLIENT_ID` dentro de `backend/.env` y en las variables de entorno del backend de producción.
4. Define `ADMIN_GOOGLE_EMAIL` con el Gmail exacto autorizado.
5. Asegúrate de que el mismo correo aparezca en una cuenta activa de la tabla `administrador`.

## Preparación de Gmail

1. Activa la verificación en dos pasos en la cuenta Gmail que enviará los códigos.
2. Genera una contraseña de aplicación de Google.
3. Configura `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`. No uses ni guardes la contraseña normal de Gmail.
4. En producción, define estas variables en el panel del proveedor del backend y no en Git.

La contraseña de aplicación es una opción sencilla para una herramienta interna pequeña. Para un despliegue de producción con mayor volumen, configura OAuth 2.0 o un proveedor de correo transaccional; Gmail puede bloquear conexiones de servidores que considere inusuales.

## Base de datos y puesta en marcha

1. Ejecuta `database/admin_password_recovery.sql` en la base MenuGo.
2. Copia `backend/.env.example` a `backend/.env` y completa las variables.
3. Instala dependencias desde `backend` con `npm ci` y reinicia el servidor.
4. Prueba con el correo de un administrador existente: el formulario envía el código, luego permite cambiar la contraseña.

La pantalla comunica una respuesta genérica cuando solicita un código para no revelar si un correo está registrado. Google y el restablecimiento solo se habilitan para cuentas de administrador activas.
