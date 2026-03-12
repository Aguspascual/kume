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

- **Framework**: Expo (`expo@~53`), React Native (`react-native@0.79`), React (`19`).
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

- Node.js LTS (recomendado 18+).
- npm (o Yarn/PNPM).
- App Expo Go instalada en tu dispositivo móvil, o emulador Android/iOS configurado.

### Pasos

1) Clonar el repositorio

```bash
git clone https://github.com/Aguspascua/Buscapolo.git
cd kume
```

2) Instalar dependencias

```bash
npm install
# ó
yarn install
```

3) Levantar el proyecto con Expo

```bash
npm run start
# Atajos
npm run android   # abrir en emulador/dispositivo Android
npm run ios       # abrir en simulador iOS (macOS requerido)
npm run web       # abrir en web
```

Escanea el QR con la app Expo Go para abrirlo en tu dispositivo.

### Scripts disponibles

- `npm run start`: inicia el servidor de desarrollo de Expo.
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

## Contribución

1. Haz un fork del repositorio y crea una rama por cambio (`feat/…`, `fix/…`).
2. Asegura formateo y lint sin errores.
3. Envía un Pull Request describiendo claramente el cambio.

## Autor

- Agustín Pascual Marcos
- LinkedIn: `https://www.linkedin.com/in/agustin-pascual-marcos`
- GitHub: `https://github.com/Aguspascual`

