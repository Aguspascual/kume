# Contrato de monitoreo KÜME → NODUS

**Estado: implementada en el código fuente; disponible en producción solo después de desplegar el backend, publicar DNS/TLS y configurar el secreto compartido.**

## Estado actual frente al contrato

El backend implementa `GET /healthz`, `GET /readyz`, autenticación de cuentas, `GET/PUT /api/v1/me` y `GET/PUT /api/v1/data/{collection}`. Las colecciones admitidas son `clientes`, `presupuestos`, `trabajos` y `tiposTrabajo`; cada una devuelve el arreglo JSON por cuenta, con ETag/revisión.

El código agrega `/api/v1/integrations/nodus/{summary|history|users|accesses|backups|activity|dependencies}`, un Bearer de solo lectura, auditoría, muestreo de recursos y consultas de dependencias. La fuente de backups de servidor sigue sin estar configurada: devuelve `items: []` y `not_configured`. La exportación de backup de la app es local al dispositivo.

La tabla `users` contiene UUID, email, nombre, teléfono y `created_at`; `auth_sessions` contiene hash del token, usuario, `created_at` y expiración. `user_data` conserva arreglos JSONB separados por usuario y colección, con revisión y `updated_at`. No se registra IP, resultado de acceso, último uso de sesión ni actividad por entidad. El contenedor PostgreSQL usa imagen `postgres:18-alpine`; la imagen de API no tiene versión de aplicación publicada.

Por lo tanto, los JSON de ejemplo de abajo son **fixtures de contrato**, no lecturas de producción. Cuando una fuente todavía no exista, el endpoint propuesto debe usar `null` en las métricas no disponibles y marcar la fuente `not_configured`; no debe inventar ceros, eventos ni backups. La lista de usuarios del ejemplo es una identidad ficticia bajo `example.invalid` y no representa una cuenta real.

## URL y autenticación

URL base final para configurar `NODUS_KUME_URL`:

```text
https://kume.agromanager.com.ar/api/v1/integrations/nodus
```

Al verificarlo, el DNS público devolvió NXDOMAIN para `kume.agromanager.com.ar`; no se pudo validar el certificado TLS ni la accesibilidad desde NODUS. Hay que publicar el registro del subdominio y configurar el proxy TLS hacia el puerto HTTP interno 8080 del API. El OpenAPI solo publica la URL HTTPS final; no existe alternativa HTTP ni hostname Docker privado.

NODUS envía `Authorization: Bearer <NODUS_KUME_TOKEN>` en cada GET. KÜME compara ese valor con el secreto `NODUS_KUME_TOKEN` del contenedor API; el mismo valor debe configurarse en el secret store de NODUS. El permiso es solo `kume:monitor:read`; sesiones de usuario reciben 403 y no se admiten escrituras. Token vacío deshabilita la integración y responde 503. No se crea ni publica un token real en este cambio.

## Reglas comunes

- Éxito: `HTTP 200`, `Content-Type: application/json; charset=utf-8`, sin redirecciones. El JSON de cada ruta tiene `contract_version: "1"`, `application`, `generated_at`, `data` y `sources`.
- `application.id` y `.name` son los constantes `kume` y `Kume`. `application.version` es una versión de build real o `null` hasta instrumentar el build.
- Todas las fechas se expresan en UTC con `Z`, RFC3339 (por ejemplo `2026-11-10T15:04:05Z`). Valores de filtros `since` también deben ser RFC3339 UTC. La fecha de corte `since` es inclusiva; se recomienda solapamiento de dos minutos y deduplicar por `event_id`.
- Toda propiedad definida como nullable se mantiene presente en la respuesta y vale `null` si no se conoce/no se puede obtener. Las excepciones son `node.role`, que por el contrato de entrada usa `""` cuando se desconoce, y las propiedades `reason`/`detail`, que están presentes como `null` si no aplican.
- `sources[].name` es un identificador estable, no localizado. Estados posibles: `available` = fuente consultada y fresca; `partial` = respondió pero faltan mediciones/campos; `unavailable` = fuente configurada, pero falló; `not_configured` = no hay recolector/configuración para esa fuente. `reason` es texto legible o `null`. Los estados desconocidos de métricas se representan además con `null` en el campo correspondiente.
- `data` siempre es un objeto no vacío; las listas sin entradas son `[]`, nunca `null`. Una lista vacía con fuente `not_configured` no significa que se verificó que no existieran registros.
- Los conteos son enteros no negativos. CPU/memoria son porcentajes de 0 a 100. Memoria se mide en bytes; tráfico de red en bytes/s; uptime en segundos.
- Las consultas se realizan en paralelo. El servicio acepta 7 solicitudes simultáneas, limita a 60 solicitudes/minuto por token y mantiene cada cuerpo debajo de 1 MiB. No se redirigen las rutas. El timeout de 8 s es objetivo de diseño; aún no hay medición de latencia p95/p99 publicada.

## Rutas, filtros y paginación implementadas

Todos los paths son relativos a `NODUS_KUME_URL` y requieren el mismo Bearer de solo lectura.

| Ruta | Datos y orden | Página y límites |
| --- | --- | --- |
| `GET /summary` | Snapshot actual; cada campo tiene las unidades y semántica del esquema OpenAPI. | Sin paginación. |
| `GET /history?range=15m` | Muestras en orden ascendente por `observed_at`; timestamps únicos. | Solo se acepta `15m` en v1. Resolución: 60 s. Retención: 7 días. Si aún no hay muestras reales, `points: []`. |
| `GET /users?page=1&page_size=100` | Cuentas KÜME, orden estable `created_at ASC, user_id ASC`. El email/nombre son datos personales; NODUS debe restringir acceso y retención. No se expone teléfono. | `page >= 1`; `page_size` entre 1 y 100, default 100. `items`, `page`, `page_size`, `total_items`, `total_pages`, `has_more`. Sobre máximo se responde 400; no se reduce silenciosamente. |
| `GET /accesses?since=...&limit=50` | Eventos por `occurred_at ASC, event_id ASC`; `since` inclusivo. | `limit` 1–50, default 50; cursor opcional opaco para continuar la misma consulta. Si excede máximo, 400. `has_more`/`next_cursor` informa continuación. |
| `GET /backups?limit=20` | Por ahora `items: []`; el catálogo de backups de servidor no está configurado. | `limit` 1–20, default 20. No hay cursor en esta versión; no incluye contenido, rutas ni secretos del backup. |
| `GET /activity?since=...&limit=50` | Auditoría de acciones, `occurred_at ASC, event_id ASC`; `since` inclusivo. | Igual que `/accesses`: 1–50, cursor opcional y límite excedido = 400. |
| `GET /dependencies` | Inventario de servicios/dependencias operativas, orden estable por `dependency_id ASC`. | Lista pequeña, sin paginación. Se deben enumerar solo dependencias configuradas; ausencia de inventario = `items: []` y fuente `not_configured`. |

Los cursores son opacos, URL-safe, acotados a la ruta/filtro/orden inicial, expiran luego de 15 minutos y no incluyen credenciales. Los items no deben repetirse entre páginas de un cursor. En llamadas periódicas NODUS puede volver a consultar los dos minutos solapados; `event_id` es la llave de deduplicación. Si se excede un límite máximo, se responde 400; no se reduce silenciosamente.

## Esquemas y semántica por ruta

Los esquemas normativos y ejemplos completos están en [openapi-nodus.yaml](openapi-nodus.yaml). Resumen de los campos que no pueden inferirse del backend actual:

- **summary**: `status` es `online` si PostgreSQL responde; `unknown` si falla readiness (un proceso detenido no responde). `uptime_seconds` es el uptime de este proceso API. Los recursos corresponden al **contenedor API**, no al host: CPU vía cgroup v2, memoria por `memory.current/max` y red por `/proc/net/dev` excluyendo loopback. `active_sessions` cuenta filas de `auth_sessions` no vencidas. Los usuarios únicos son distintos usuarios con acceso exitoso desde medianoche UTC, lunes UTC o día 1 UTC. Los conteos son `null` para períodos que comenzaron antes de `audit_started_at`, porque no hay eventos retroactivos.
- **synchronization.state**: el estado de sincronización de móviles solo vive en memoria de cada dispositivo; KÜME no conserva una agregación central. Se devuelve `unknown`; no confundir con disponibilidad de PostgreSQL.
- **backup.state**: `success`, `failure`, `in_progress`, `unknown`, `not_configured`. `last_created_at` y `size_bytes` solo se completan con datos del catálogo de backups del servidor. Hoy las exportaciones son archivos locales en el teléfono; no deben reportarse como backups del servidor.
- **history.resources**: cada medición numérica puede ser `null`. Se persiste un punto por minuto durante 7 días. Red se deriva de deltas de contadores con intervalo medido; al primer muestreo, tras reinicio o sin interfaz elegible, el rate es `null`.
- **users**: `user_id` es UUID estable de `users.id`; `email` es normalizado y estable por cuenta; `display_name` puede cambiar; `created_at` es la creación real de la fila. `active_sessions` es entero de sesiones no expiradas. `last_seen_at` usa el último acceso exitoso que registra la auditoría y es `null` si la cuenta aún no tiene uno desde que se instaló la migración. No se incluye teléfono.
- **accesses**: tabla append-only con retención de 90 días; registra login/registro exitoso y fallos de credenciales. `event_id` UUID persistido, `source=password`, `result=success|failure`; `user_id` null si no se identificó cuenta; `reason` usa códigos genéricos. `ip_address` devuelve null porque el API no confía en cabeceras de proxy sin una lista de proxies confiables.
- **activity**: auditoría append-only con retención de 90 días; registra creación de cuenta, inicio/cierre de sesión, cambio de perfil y escrituras de colecciones. `outcome` es autoritativo `success|failure|info`; `result` siempre es igual. No incluye contraseñas, tokens ni payloads de clientes.
- **backups**: `backup_id` es identificador estable; `created_at` fecha UTC; `state` según arriba; `size_bytes` nullable y no negativo; `checksum_sha256` nullable, SHA-256 hexadecimal del archivo completo. En el ejemplo, la lista vacía y `not_configured` señalan que no existe fuente de backups.
- **dependencies**: incluye `go-runtime` vía `runtime.Version()` y PostgreSQL vía `current_setting('server_version')`; `dependency_id` es estable; `kind` `runtime|service`; `state` `healthy|unavailable`; `required` true; `checked_at` es el instante real del chequeo. Si PostgreSQL falla, version es null y state unavailable. No publica endpoints, variables de entorno, nombres de host privados ni secretos.

### Catálogo de campos (normativo)

Salvo donde se indica otra cosa, los campos enumerados son obligatorios. `nullable` significa que la clave se conserva y puede tener JSON `null`; no equivale a opcional. Los objetos no deben omitir las propiedades requeridas.

**Sobre común de las siete respuestas**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `contract_version` | string, no | Constante `"1"`; versión del contrato, no de la app. |
| `application.id` | string, no | Constante `"kume"`. |
| `application.name` | string, no | Constante `"Kume"`. |
| `application.version` | string o null | Versión real del build; null mientras no se inyecte/publica build metadata. |
| `generated_at` | string date-time, no | RFC3339 UTC terminado en `Z`; hora de generación de esta respuesta. |
| `data` | objeto no vacío, no | Payload específico de la ruta; contiene claves aunque sus listas estén vacías. |
| `sources[]` | array de objetos, no | Fuentes consultadas/configuradas para formar `data`. |
| `sources[].name` | string, no | ID estable sin traducción/localización. |
| `sources[].state` | string enum, no | `available`, `partial`, `unavailable` o `not_configured`, con semántica indicada arriba. |
| `sources[].reason` | string o null | Motivo legible, sin secretos; null cuando no hay motivo. |

**`GET /summary`, `data`**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `status` | string enum, no | `online`, `offline`, `unknown`; readiness de la aplicación KÜME, no del host. |
| `node.id`, `node.name` | string o null | ID/nombre estable del nodo; no usar hostname de host si solo se midió el contenedor. |
| `node.role` | string, no | Rol del nodo; `""` cuando se desconoce, según el esquema solicitado. |
| `uptime_seconds` | integer ≥0 o null | Segundos desde el inicio de la aplicación/proceso; no confundir con uptime del host. |
| `synchronization.state` | string enum, no | `healthy`, `degraded`, `unknown`; salud de sincronización de datos cliente-servidor. |
| `resources.scope` | string enum, no | `application`, `container` o `unknown`; scope exacto de CPU/memoria/red. Nunca significa host salvo implementación explícita. |
| `resources.cpu.usage_percent` | number 0–100 o null | Porcentaje de CPU dentro de `scope`. |
| `resources.memory.used_bytes`, `total_bytes` | integer ≥0 o null | Bytes usados y límite/capacidad observada dentro de `scope`; no convertir a MB en JSON. |
| `resources.memory.usage_percent` | number 0–100 o null | Porcentaje calculado del mismo par de memoria/scope; null si no se conoce alguno. |
| `resources.network.receive_bytes_per_second`, `send_bytes_per_second` | number ≥0 o null | Bytes por segundo recibidos/enviados por la interfaz incluida en `scope`; null si no hay delta fiable. |
| `users.active_sessions`, `unique_today`, `unique_week`, `unique_month` | integer ≥0 o null | Conteos. Sesiones no vencidas; usuarios distintos con acceso exitoso, respectivamente desde medianoche UTC, lunes 00:00 UTC y día 1 00:00 UTC. |
| `backup.last_created_at` | string date-time UTC o null | Instante de creación del último backup de servidor confirmado. |
| `backup.state` | string enum, no | `success`, `failure`, `in_progress`, `unknown`, `not_configured`; estado de la última tarea/catálogo. |
| `deployment.version` | string o null | Tag/release/build real desplegado; nunca inferirlo de un tag móvil o valor de ejemplo. |

**`GET /history`, `data`**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `range` | string constante, no | `"15m"`; ventana consultada relativa a `generated_at`. |
| `points` | array, no | Puntos cronológicos; puede ser `[]` cuando aún no hay muestras reales. No repetir `observed_at`. |
| `points[].observed_at` | string date-time UTC, no | Instante real de muestreo, no de inserción posterior. |
| `points[].resources.cpu_usage_percent` | number 0–100 o null | Porcentaje de CPU del mismo scope configurado. |
| `points[].resources.memory_used_bytes`, `memory_total_bytes` | integer ≥0 o null | Bytes observados. |
| `points[].resources.network_receive_bytes_per_second`, `network_send_bytes_per_second` | number ≥0 o null | Bytes/s, con la misma dirección y scope que `/summary`. |
| `points[].users.active_sessions` | integer ≥0 o null | Sesiones vigentes en `observed_at`; null si no se muestreó. |

**`GET /users`, `data`**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `items` | array, no | Página de cuentas de KÜME; no son los clientes guardados por usuarios de la app. |
| `items[].user_id` | string UUID, no | ID estable e inmutable de la cuenta. |
| `items[].email` | string email, no | Email normalizado; identificador estable actual y dato personal. |
| `items[].display_name` | string, no | Nombre de cuenta; dato personal y mutable. |
| `items[].created_at` | string date-time UTC, no | Fecha de creación en PostgreSQL. |
| `items[].active_sessions` | integer ≥0 o null | Sesiones actuales no vencidas, cuenta por cuenta. |
| `items[].last_seen_at` | string date-time UTC o null | Último acceso exitoso observado; null hasta guardar eventos de acceso. |
| `page`, `page_size` | integer, no | Página 1-based y tamaño efectivo, no mayores de 100. |
| `total_items`, `total_pages` | integer ≥0, no | Totales calculados sobre la misma consulta. Con cero cuentas, `total_pages: 0`. |
| `has_more` | boolean, no | Si hay página posterior. |

**`GET /accesses`, `data` y cada `items[]`**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `since` | string date-time UTC, no | Filtro inclusivo usado para esta página. |
| `limit` | integer 1–50, no | Límite efectivo; nunca se reduce silenciosamente. |
| `items` | array, no | Eventos ordenados por fecha/ID ascendente. |
| `has_more` | boolean, no | Hay más eventos con el mismo filtro. |
| `next_cursor` | string o null | Cursor opaco para continuar; null si no hay siguiente página. |
| `event_id` | string UUID, no | ID persistido y estable para deduplicar un mismo evento. |
| `occurred_at` | string date-time UTC, no | Momento en que ocurrió el evento. |
| `user_id` | string UUID o null | Cuenta identificada; null en intentos no asociados a cuenta. |
| `source` | string enum, no | `password`; el backend actual registra login/registro mediante credenciales. |
| `result` | string enum, no | En v1 `success` o `failure`. |
| `ip_address` | string IP o null | IPv4/IPv6 observada, si la política permite registrarla; no usar IP inventada. |
| `reason` | string o null | Motivo seguro del resultado, sin contraseñas, tokens ni stack traces. |

**`GET /backups`, `data` y cada `items[]`**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `limit` | integer 1–20, no | Límite efectivo solicitado. |
| `items` | array, no | Backups de servidor, más reciente primero. |
| `has_more` | boolean, no | Hay más registros. |
| `next_cursor` | string o null | Cursor opaco de continuación. |
| `backup_id`, `created_at`, `state`, `size_bytes`, `checksum_sha256` | No hay objetos mientras `server_backup_catalog` esté `not_configured`. | El backend devuelve `items: []`, `has_more: false`; todavía no hay catálogo de backups de servidor que produzca esos campos. |

**`GET /activity`, `data` y cada `items[]`**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `since`, `limit`, `has_more`, `next_cursor` | Igual a `/accesses` | Mismo filtro inclusivo, límite y cursor. |
| `event_id` | string UUID, no | ID persistido y estable para deduplicación. |
| `occurred_at` | string date-time UTC, no | Instante de la acción. |
| `category` | string enum, no | `auth`, `account`, `data` o `system`. |
| `title` | string, no | Título legible, máximo 160 caracteres. |
| `detail` | string o null | Detalle seguro, máximo 1000 caracteres; no incluir secretos ni datos personales innecesarios. |
| `outcome` | string enum, no | Campo autoritativo: `success`, `failure` o `info`. |
| `result` | string enum, no | Alias compatibilidad; debe ser exactamente igual a `outcome`. |

**`GET /dependencies`, `data` y cada `items[]`**

| Campo | Tipo / nullable | Unidad, zona horaria y significado |
| --- | --- | --- |
| `items` | array, no | Inventario operativo ordenado por ID; `[]` más fuente `not_configured` si no hay inventario. |
| `dependency_id` | string, no | Identificador estable de la dependencia. |
| `name` | string, no | Nombre legible/operativo. |
| `kind` | string enum, no | `service`, `runtime` o `library`. |
| `version` | string o null | Versión real observada/configurada; null si no se conoce. |
| `state` | string enum, no | `healthy`, `degraded`, `unavailable` o `unknown`. |
| `required` | boolean, no | Si KÜME necesita la dependencia para su función principal. |
| `checked_at` | string date-time UTC o null | Último chequeo real; null si nunca se chequeó. |
| `reason` | string o null | Explicación segura del estado; sin topología privada ni secretos. |

## Errores HTTP

El backend existente emite para sus handlers JSON plano `{"error":"codigo","message":"texto"}`. Para las rutas NODUS, el formato JSON es consistente en todos los errores:

Para las nuevas rutas se propone mantener el formato JSON plano existente en todos los errores:

```json
{"error":"unauthorized","message":"Bearer ausente, inválido o revocado."}
```

| HTTP | `error` | Uso |
| --- | --- | --- |
| 400 | `invalid_request` | Parámetro, fecha, rango, límite o cursor inválido. |
| 401 | `unauthorized` | Token ausente, inválido, expirado o revocado. |
| 403 | `forbidden` | Se envió una sesión de usuario KÜME que no tiene permiso de monitoreo. |
| 404 | `not_found` | Endpoint/recurso inexistente; JSON, no fallback HTML. |
| 429 | `rate_limited` | Límite excedido; incluir `Retry-After` entero en segundos. |
| 500 | `internal_error` | Error inesperado, sin detalles internos/SQL. |
| 503 | `integration_not_configured` / `source_unavailable` | Token de integración ausente en KÜME o una fuente requerida inaccesible; fuentes opcionales usan 200 con estado/null. |

No se redirige ninguna ruta. Respuestas incluyen `Cache-Control: no-store`; cuerpos están limitados a 1 MiB.

## Frecuencia, tiempo y tamaño

Se limita a 60 solicitudes/minuto por token y se aceptan las siete consultas paralelas; `429` incluye `Retry-After`. El hard cap es 1 MiB por respuesta. El timeout de 8 s es el objetivo de diseño; no hay percentiles p95/p99 medidos todavía. `/users` page size 100, eventos 50, backups 20.

## Pendiente de despliegue/configuración

1. Publicar el DNS de `kume.agromanager.com.ar`; el resolvedor público devolvió NXDOMAIN en esta sesión.
2. Instalar un certificado TLS válido y dirigir el proxy hacia el puerto interno 8080, sin redirecciones en `/api/v1/integrations/nodus/*`.
3. Generar un token aleatorio y cargar el mismo secreto en `NODUS_KUME_TOKEN` del API KÜME y en el secret store de NODUS. El repositorio no contiene un token.
4. Definir un backup de servidor si se quiere poblar `/backups`; hoy la ruta informa `not_configured` y lista vacía.
5. Restringir acceso/retención en NODUS para los datos personales email/nombre de `/users`; teléfono no se expone.

Las rutas ya están implementadas en código, pero NODUS no podrá consultarlas hasta completar DNS/TLS y configurar el mismo token en ambos servicios.
