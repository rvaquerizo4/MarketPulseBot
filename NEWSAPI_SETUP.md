# Cómo obtener y configurar la API Key de NewsAPI

Para que la sección de noticias funcione en MarketPulseBot, necesitas una API key gratuita de NewsAPI. Sigue estos pasos:

## 1. Regístrate en NewsAPI

- Ve a [https://newsapi.org/register](https://newsapi.org/register)
- Completa el formulario con tu email y una contraseña.
- Confirma tu cuenta si te lo solicita.

## 2. Obtén tu API Key

- Inicia sesión en [https://newsapi.org/](https://newsapi.org/)
- Accede a tu panel de usuario (Dashboard).
- Copia la clave que aparece como "API key" (es una cadena larga de letras y números).

## 3. Añade la API Key a tu archivo `.env`

- Abre el archivo `.env` en la raíz del proyecto.
- Añade la siguiente línea (reemplaza TU_API_KEY por la clave copiada):

  ```env
  NEWS_API_KEY=TU_API_KEY
  ```

## 4. Guarda y reinicia el bot

- Guarda el archivo `.env`.
- Reinicia el bot con `npm start` o el comando que uses normalmente.

---

**¡Listo!** Ahora la sección de noticias debería funcionar correctamente en el dashboard.
