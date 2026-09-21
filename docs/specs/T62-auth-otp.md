# T62: acceso al panel con código de 6 dígitos al correo

## Qué y para qué

Cerrar el panel: ya no entra todo el mundo. Registro y login piden un código de 6 dígitos enviado al correo.

## Criterios de aceptación

- [x] Sin sesión, `GET /state` y el resto del panel responden 401; `/health` y los webhooks de HappyRobot no.
- [x] `POST /auth/request-code` con `purpose: register | login` envía un código de 6 dígitos; register sobre correo existente es 409 y login sobre desconocido es 404.
- [x] `POST /auth/verify` crea la sesión; un código malo no entra; a los 5 fallos hay que pedir otro.
- [x] Tras el login, un onboarding pide teléfono E.164 del coordinador y de cada agente; sin los cinco no se entra al panel.
- [x] Contrato, `.env.example` y tests cubren el flujo. Sin dependencia npm nueva.

## Fuera de alcance

OAuth de Google/GitHub, contraseñas, roles, y cambiar el bearer de HappyRobot.

## Notas

`AUTH_REQUIRED=false` deja el panel abierto (tests). Sin `RESEND_API_KEY` el código sale en el log del backend. D30.
