## Küme

Aplicación móvil multiplataforma (iOS, Android y Web) construida con Expo y React Native para gestionar clientes, presupuestos y trabajos del día a día de electricistas y técnicos. Permite crear presupuestos con materiales, convertirlos en trabajos agendados, visualizar el calendario semanal, enviar presupuestos por WhatsApp y realizar copias de seguridad de los datos.

### Características principales

- **Clientes**: alta, listado, búsqueda y detalle de clientes; importación desde contactos del dispositivo.
- **Presupuestos**: creación con materiales, mano de obra, fecha de validez, fotos adjuntas y totalización automática; estados (Pendiente, Aceptado, Rechazado); vista de detalle con edición de materiales y costos.
- **Conversión a trabajos**: al aceptar un presupuesto, puede convertirse en trabajo programando fecha y hora (con verificación de conflicto horario).
- **Agenda semanal**: calendario con los trabajos de la semana, ordenados por día y hora, indicando estado de pago (Pendiente, Pagado, Cancelado).
- **Notificaciones**: recordatorio diario a las 22:00 y alertas 1 hora antes de cada trabajo programado.
- **Comunicación**: envío del presupuesto por WhatsApp al cliente con desglose de costos.
- **Backup y restore**: exportación e importación de todos los datos de la app a/desde un archivo `.json`.
- **Persistencia local**: datos almacenados con AsyncStorage para uso offline.

### Tecnologías y librerías

- **Framework**: Expo SDK 58, React Native 0.88, React 19.3.
- **Navegación**: `expo-router` (Stack).
- **UI/UX**: `@expo/vector-icons`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-screens`, `react-native-safe-area-context`.
- **Estado y almacenamiento**: `@react-native-async-storage/async-storage`.
- **Fechas**: `date-fns` con `locale` ES.
- **Sistema**: `expo-file-system`, `expo-document-picker`, `expo-sharing`.
- **Medios**: `expo-image-picker`, `expo-image`.
- **Notificaciones**: `expo-notifications`.
- **Contactos**: `expo-contacts`.

### Estructura básica

- `app/_layout.js`: definición del stack de navegación con `expo-router`.
- `app/index.js`: pantalla principal con accesos rápidos, exportación/importación de backup y registro de notificaciones.
- `app/NewBudgetScreen.js`: creación de presupuestos, materiales, fotos y envío por WhatsApp.
- `app/BudgetsScreen.js`: listado, búsqueda y filtro de presupuestos.
- `app/BudgetDetailScreen.js`: detalle, edición de materiales, cambio de estado y conversión a trabajo.
- `app/WeeklyCalendarScreen.js`: calendario semanal de trabajos.
- `app/UsersScreen.js`: gestión de clientes e importación desde contactos.
- Otras pantallas: `NewClientScreen`, `ClientDetailScreen`, `NewWorkScreen`, `WorkDetailScreen`, `MonthlySummaryScreen`.

## Instalación y ejecución

### Requisitos

- Node.js 22.13 o superior (requisito de Expo SDK 58).
- npm (o Yarn/PNPM).
- App Expo Go instalada en tu dispositivo móvil, o emulador Android/iOS configurado.

### Pasos

1) Clonar el repositorio

```bash
git clone https://github.com/Aguspascua/Buscapolo.git
cd Buscapolo
```

2) Instalar dependencias

```bash
npm install
# ó
yarn install
```

3) Levantar el proyecto con Expo

```bash
npm start
# Atajos
npm run android   # abrir en emulador/dispositivo Android
npm run ios       # abrir en simulador iOS (macOS requerido)
npm run web       # abrir en web
```

Metro usa el puerto 8100, configurado en `.env`, tanto con `npx expo start -c` como con `npm start`. `.env.local` fija la IP LAN actual de esta PC (`192.168.0.240`) para que el QR de Expo Go apunte al adaptador Wi-Fi. Si cambia la IP de la PC, actualiza `REACT_NATIVE_PACKAGER_HOSTNAME` y `EXPO_PUBLIC_API_URL` en `.env.local`. En PowerShell, si en esa misma ventana habías configurado `EXPO_PACKAGER_PROXY_URL`, borra ese override antes de iniciar: puede dejar el QR apuntando a una IP o puerto anterior.

```powershell
Remove-Item Env:EXPO_PACKAGER_PROXY_URL -ErrorAction SilentlyContinue
npx expo start -c --go --lan --port 8100
```

Escanea el QR con Expo Go desde un teléfono conectado a la misma red local que la computadora.

### Scripts disponibles

- `npm start`: inicia Expo en el puerto 8100.
- `npm run android` | `npm run ios` | `npm run web`: abre la app en cada plataforma.
- `npm run reset-project`: limpia cachés/artefactos (script local).
- `npm run lint`: ejecuta ESLint.

## Permisos utilizados

- Contactos: importación de clientes (`expo-contacts`).
- Notificaciones: recordatorios diarios y de trabajos (`expo-notifications`).
- Cámara/Medios: adjuntar fotos a presupuestos (`expo-image-picker`).
- Sistema de archivos y compartición: backup/restore (`expo-file-system`, `expo-document-picker`, `expo-sharing`).

En iOS/Android se solicitarán permisos en tiempo de ejecución. Si compilas binarios, declara los permisos correspondientes en las configuraciones nativas si fuera necesario.

## Flujo de datos y almacenamiento

- Los datos se guardan localmente en `AsyncStorage` bajo claves como `clientes`, `presupuestos` y `trabajos`.
- Exportación/Importación crea/restaura un archivo `kume_backup.json` con todo el contenido del almacenamiento local.
- Notificaciones: se programa un recordatorio diario a las 22:00 y una alerta 1 hora antes de cada trabajo futuro.

## Backend (inicio)

El backend inicial está en Go y usa PostgreSQL. El API crea cuentas, inicia/cierra sesiones y guarda las colecciones actuales de la app (`clientes`, `presupuestos`, `trabajos` y `tiposTrabajo`) separadas por usuario. Las contraseñas se almacenan con bcrypt; los tokens de sesión son aleatorios y la base guarda solo su hash. El API se conecta con un usuario de base de datos sin privilegios de superusuario.

Para levantarlo con Docker Desktop:

```powershell
Copy-Item .env.docker.example .env.docker
# Editar .env.docker y reemplazar ambas contraseñas por valores aleatorios distintos.
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker logs -f api
```

Los contenedores aparecen como `KUME_back` (API) y `KUME_BD` (PostgreSQL), dentro de la red `KUME_network`. El API escucha en `8080` dentro del contenedor y publica el puerto local `18080`. La app móvil usa `https://kume.agromanager.com.ar`; el DNS y el proxy TLS de ese dominio deben dirigir al API. PostgreSQL no publica su puerto al host. Los datos sobreviven al reinicio de los contenedores en el volumen `KUME_BD_data`; `docker compose down -v` elimina ese volumen.

Rutas iniciales: `GET /healthz`, `GET /readyz`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET/PUT /api/v1/me` y `GET/PUT /api/v1/data/{clientes|presupuestos|trabajos|tiposTrabajo}`. Las rutas privadas requieren `Authorization: Bearer <token>`. Para guardar una colección, el cliente primero la consulta, conserva el `ETag` y lo envía en `If-Match` al hacer `PUT`; así se detecta si otro dispositivo guardó una versión más nueva.

La pantalla móvil de inicio de sesión y registro usa las rutas de autenticación del API. Al registrarse pide nombre y teléfono de contacto del responsable; se pueden actualizar desde Ajustes → Datos del responsable. La URL se configura con `EXPO_PUBLIC_API_URL` (en `.env.local` se apunta a `https://kume.agromanager.com.ar`). Las colecciones `clientes`, `presupuestos`, `trabajos` y `tiposTrabajo` conservan una caché en AsyncStorage y se sincronizan por cuenta con el servidor al iniciar sesión y al guardar cambios. Una cuenta nueva empieza vacía y no hereda la caché de otra cuenta; los datos locales previos se conservan vinculados a la cuenta que estaba activa. Las escrituras que no encuentran conexión quedan pendientes, se reintentan al volver a abrir la app y se muestra su estado en Inicio. El API usa ETag para detectar escrituras concurrentes.

Los PDF de presupuestos y trabajos usan el perfil de cuenta para imprimir el nombre y teléfono del profesional responsable.

Desde Ajustes se puede restablecer con confirmación el contenido completo de la cuenta activa. Sirve también para vaciar datos heredados que se hayan sincronizado antes de esta corrección.

Las fotos siguen siendo URI de archivos locales: el API guarda los registros JSON, pero todavía no sube archivos de imagen, así que las fotos no estarán disponibles en otros dispositivos. Esta configuración Docker es para desarrollo en una red confiable; antes de publicarla en Internet hacen falta HTTPS, limitación de intentos de login, verificación de correo y recuperación de contraseña.

## Contribución

1. Haz un fork del repositorio y crea una rama por cambio (`feat/…`, `fix/…`).
2. Asegura formateo y lint sin errores.
3. Envía un Pull Request describiendo claramente el cambio.

## Autor

- Agustín Pascual Marcos
- LinkedIn: `https://www.linkedin.com/in/agustin-pascual-marcos`
- GitHub: `https://github.com/Aguspascual`

