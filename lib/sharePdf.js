import * as FileSystem from "expo-file-system/legacy"
import * as Print from "expo-print"
import * as Sharing from "expo-sharing"

const escapeHtml = (value) => String(value ?? "—")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;")

const imageAsDataUri = async (value) => {
  const uri = typeof value === "string" ? value : value?.uri
  if (!uri) return null
  if (/^https?:\/\//i.test(uri)) return uri
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
    const extension = uri.split("?")[0].split(".").pop()?.toLowerCase()
    const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg"
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    console.warn("No se pudo incluir una imagen en el PDF:", error)
    return null
  }
}

const escapeMultiline = (value) => escapeHtml(value).replace(/\n/g, "<br>")

const formatGeneratedDate = (date) => date.toLocaleDateString("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
}).replace(/\./g, "").toLocaleUpperCase("es-AR")

const renderMaterials = (materials) => {
  const rows = materials.length ? materials : [{ descripcion: "Sin materiales", cantidad: "—", precioUnitario: "—", subtotal: "—" }]
  return rows.map((item) => `
    <tr>
      <td>${escapeMultiline(item.descripcion || "Material")}</td>
      <td class="numeric">${escapeHtml(item.cantidad ?? "—")}</td>
      <td class="numeric">${escapeHtml(item.precioUnitario ?? "—")}</td>
      <td class="numeric strong">${escapeHtml(item.subtotal ?? "—")}</td>
    </tr>`).join("")
}

export const buildDocumentHtml = ({
  documentType,
  title,
  subtitle,
  status,
  client = {},
  responsable = {},
  serviceDetails = [],
  materials = [],
  costs = {},
  photos = [],
  generatedAt = new Date(),
}) => {
  const photosForPdf = photos
  const detailRows = serviceDetails.filter(([, value]) => value && value !== "—")
  const detailHtml = detailRows.length ? `<div class="service-meta">${detailRows.map(([label, value]) => `<div><span class="label">${escapeHtml(label)}</span><span class="value">${escapeMultiline(value)}</span></div>`).join("")}</div>` : ""
  const addressHtml = client.address ? `<div class="wide-field"><span class="label">DIRECCIÓN DEL SERVICIO</span><span class="value">${escapeMultiline(client.address)}</span></div>` : ""
  const clientDetailHtml = client.description ? `<div class="wide-field"><span class="label">DETALLE</span><span class="value">${escapeMultiline(client.description)}</span></div>` : ""
  const photosHtml = photosForPdf.length ? `
    <section class="photos-section">
      <div class="section-heading"><span class="section-number">05</span><h2>Fotos adjuntas</h2></div>
      <div class="photo-grid">${photosForPdf.map((uri) => `<img src="${escapeHtml(uri)}" />`).join("")}</div>
    </section>` : ""
  const statusHtml = status ? `<span class="status">${escapeHtml(status)}</span>` : ""
  const fileDate = formatGeneratedDate(generatedAt)
  const generatedTime = generatedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: A4; margin: 13mm 14mm 17mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1B2D39; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .hero { position: relative; min-height: 106px; margin: 0 0 17px; padding: 17px 19px 15px; border-radius: 13px; background: #192F3C; color: #FFFFFF; page-break-inside: avoid; }
      .hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
      .doc-tag { display: inline-block; min-width: 128px; padding: 6px 12px; border-radius: 18px; background: #245560; color: #FFFFFF; font-size: 8px; font-weight: 700; letter-spacing: .3px; }
      .date-copy { text-align: right; }
      .date { font-size: 9px; font-weight: 700; }
      .generated { margin-top: 2px; color: #BCCBD0; font-size: 7px; }
      h1 { max-width: 76%; margin: 9px 0 1px; color: #FFFFFF; font-size: 22px; line-height: 1.15; font-weight: 700; }
      .subtitle { max-width: 76%; color: #B7C8CD; font-size: 8px; }
      .status { position: absolute; right: 18px; bottom: 17px; min-width: 76px; padding: 5px 11px; border-radius: 14px; background: #E6F4F1; color: #118478; text-align: center; font-size: 8px; font-weight: 700; text-transform: uppercase; }
      section { margin: 0 0 12px; page-break-inside: avoid; }
      .section-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .section-number { display: inline-flex; width: 21px; height: 21px; align-items: center; justify-content: center; border-radius: 50%; background: #E7F6F3; color: #14988C; font-size: 8px; font-weight: 700; }
      h2 { margin: 0; color: #203744; font-size: 12px; line-height: 1.25; font-weight: 700; }
      .card { overflow: hidden; border: 1px solid #DBE5E7; border-radius: 10px; background: #FFFFFF; page-break-inside: avoid; }
      .client-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; row-gap: 9px; padding: 12px 13px; }
      .field { min-width: 0; }
      .label { display: block; margin-bottom: 3px; color: #778991; font-size: 7px; font-weight: 700; letter-spacing: .35px; text-transform: uppercase; }
      .value { display: block; color: #233743; font-size: 10px; font-weight: 600; overflow-wrap: anywhere; }
      .wide-field { grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid #E4EBED; }
      .service-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin: 0 13px; padding: 8px 0 11px; border-top: 1px solid #E4EBED; }
      .responsible-card { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 13px; border: 1px solid #E0F0EB; border-radius: 10px; background: #EAF6F2; page-break-inside: avoid; }
      .table-card { border: 1px solid #DBE5E7; border-radius: 10px; page-break-inside: avoid; }
      .materials-section, .materials-section .table-card { page-break-inside: auto; }
      .materials-section thead { display: table-header-group; }
      .materials-section tr { page-break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; }
      thead { background: #F3F6F6; }
      th { padding: 8px 9px; color: #778991; font-size: 7px; font-weight: 700; text-align: left; text-transform: uppercase; }
      td { padding: 10px 9px; border-top: 1px solid #E8EDEF; color: #324650; font-size: 9px; vertical-align: top; }
      th.numeric, td.numeric { text-align: right; white-space: nowrap; }
      td.strong { color: #263B47; font-weight: 700; }
      .cost-card { padding: 8px 13px; border: 1px solid #DBE5E7; border-radius: 10px; background: #FFFFFF; page-break-inside: avoid; }
      .cost-row { display: flex; justify-content: space-between; gap: 14px; padding: 6px 0; color: #74848A; font-size: 9px; }
      .cost-row strong { color: #354851; font-size: 9px; }
      .cost-total { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 3px; padding: 10px 0 2px; border-top: 1px solid #E0E8EA; color: #253B47; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      .cost-total strong { color: #15978C; font-size: 16px; white-space: nowrap; }
      .photos-section { page-break-inside: auto; }
      .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .photo-grid img { width: 48%; height: 155px; object-fit: contain; border: 1px solid #DBE5E7; border-radius: 9px; background: #F5F7F6; page-break-inside: avoid; }
      .footer { position: fixed; right: 0; bottom: -10mm; left: 0; display: flex; justify-content: space-between; padding-top: 7px; border-top: 1px solid #DCE5E7; color: #718189; font-size: 7px; }
      .page-number:after { content: "Página " counter(page) " de " counter(pages); }
    </style></head><body>
      <header class="hero">
        <div class="hero-top"><span class="doc-tag">${escapeHtml(documentType)}</span><div class="date-copy"><div class="date">${escapeHtml(fileDate)}</div><div class="generated">Generado: ${escapeHtml(generatedTime)}</div></div></div>
        <h1>${escapeHtml(title)}</h1><div class="subtitle">${escapeHtml(subtitle)}</div>${statusHtml}
      </header>

      <section class="materials-section">
        <div class="section-heading"><span class="section-number">01</span><h2>Cliente y ubicación</h2></div>
        <div class="card client-grid">
          <div class="field"><span class="label">Cliente</span><span class="value">${escapeHtml(client.name)}</span></div>
          <div class="field"><span class="label">Teléfono</span><span class="value">${escapeHtml(client.phone)}</span></div>
          ${addressHtml}${clientDetailHtml}
        </div>
        ${detailHtml}
      </section>

      <section>
        <div class="section-heading"><span class="section-number">02</span><h2>Profesional responsable</h2></div>
        <div class="responsible-card">
          <div class="field"><span class="label">Nombre del trabajador</span><span class="value">${escapeHtml(responsable.name)}</span></div>
          <div class="field"><span class="label">Teléfono de contacto</span><span class="value">${escapeHtml(responsable.phone)}</span></div>
        </div>
      </section>

      <section>
        <div class="section-heading"><span class="section-number">03</span><h2>${escapeHtml(materials.length ? "Materiales utilizados" : "Materiales y servicios")}</h2></div>
        <div class="table-card"><table>
          <thead><tr><th>Descripción</th><th class="numeric">Cant.</th><th class="numeric">P. unitario</th><th class="numeric">Subtotal</th></tr></thead>
          <tbody>${renderMaterials(materials)}</tbody>
        </table></div>
      </section>

      <section>
        <div class="section-heading"><span class="section-number">04</span><h2>Resumen de costos</h2></div>
        <div class="cost-card">
          <div class="cost-row"><span>Materiales</span><strong>${escapeHtml(costs.materials || "$ 0")}</strong></div>
          <div class="cost-row"><span>Mano de obra</span><strong>${escapeHtml(costs.labor || "$ 0")}</strong></div>
          <div class="cost-total"><span>Total</span><strong>${escapeHtml(costs.total || "$ 0 ARS")}</strong></div>
        </div>
      </section>
      ${photosHtml}
      <footer class="footer"><span>Generado con KÜME · Aplicación de gestión de trabajos y servicios</span><span class="page-number"></span></footer>
    </body></html>`
}

export const createAndSharePdf = async (document) => {
  const photosForPdf = (await Promise.all((document.photos || []).map(imageAsDataUri))).filter(Boolean)
  const html = buildDocumentHtml({ ...document, photos: photosForPdf })

  if (!(await Sharing.isAvailableAsync())) throw new Error("La función para compartir no está disponible en este dispositivo.")
  const generatedPdf = await Print.printToFileAsync({ html, base64: true })
  if (!generatedPdf.base64) throw new Error("No se pudo leer el archivo PDF generado.")

  const pdfDirectory = `${FileSystem.documentDirectory}kume-pdfs/`
  await FileSystem.makeDirectoryAsync(pdfDirectory, { intermediates: true })
  const fileName = `${document.title.toLocaleLowerCase("es-AR").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "documento"}-${Date.now()}.pdf`
  const shareUri = `${pdfDirectory}${fileName}`
  await FileSystem.writeAsStringAsync(shareUri, generatedPdf.base64, { encoding: FileSystem.EncodingType.Base64 })
  await Sharing.shareAsync(shareUri, { dialogTitle: `Compartir ${document.title}`, mimeType: "application/pdf", UTI: ".pdf" })
  return shareUri
}
