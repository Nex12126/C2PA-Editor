import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, BadgeCheck, Camera, Check, ChevronDown, CircleAlert,
  FileImage, Fingerprint, ImagePlus, MapPin, RefreshCw, ShieldCheck, Sparkles, Upload,
} from 'lucide-react'
import { createC2pa, Reader } from '@contentauth/c2pa-web'
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url'
import swarmPic from './assets/swarm-logo.webp'
import exifr from 'exifr'
import piexif from 'piexifjs'
import './App.css'

type EditableMetadata = { description: string; artist: string; copyright: string; capturedAt: string }
type C2paInfo = { store: unknown; active: unknown }

const emptyMetadata: EditableMetadata = { description: '', artist: '', copyright: '', capturedAt: '' }
const maxFileSize = 50 * 1024 * 1024
const supportedTypes = ['image/jpeg', 'image/png', 'image/webp']

function displayValue(value: unknown): string {
  if (value instanceof Date) return value.toLocaleString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return ''
}

function exifDateValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${value.getFullYear()}:${pad(value.getMonth() + 1)}:${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})[-:](\d{2})[-:](\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/)
    if (match) return `${match[1]}:${match[2]}:${match[3]} ${match[4] ?? '00'}:${match[5] ?? '00'}:${match[6] ?? '00'}`
  }
  return ''
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [metadata, setMetadata] = useState<Record<string, unknown>>({})
  const [editable, setEditable] = useState(emptyMetadata)
  const [c2paInfo, setC2paInfo] = useState<C2paInfo | null>(null)
  const [activeTab, setActiveTab] = useState<'metadata' | 'c2pa'>('metadata')
  const [isDragging, setIsDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [showAllMetadata, setShowAllMetadata] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef('')
  const c2paRef = useRef<Awaited<ReturnType<typeof createC2pa>> | null>(null)

  useEffect(() => {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.append(favicon)
    }
    favicon.href = swarmPic

    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      c2paRef.current?.dispose()
    }
  }, [])

  async function openFile(nextFile?: File) {
    if (!nextFile) return
    setError('')
    setNotice('')
    if (!supportedTypes.includes(nextFile.type)) return setError('Choose a JPEG, PNG, or WebP image.')
    if (nextFile.size > maxFileSize) return setError('The file exceeds the 50 MB limit.')

    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const nextUrl = URL.createObjectURL(nextFile)
    urlRef.current = nextUrl
    setPreviewUrl(nextUrl)
    setFile(nextFile)
    setMetadata({})
    setEditable(emptyMetadata)
    setC2paInfo(null)
    setShowAllMetadata(false)
    setActiveTab('metadata')
    setBusy(true)

    try {
      const parsed = await exifr.parse(nextFile, { tiff: true, exif: true, gps: true, iptc: true, xmp: true })
      const tags = (parsed ?? {}) as Record<string, unknown>
      setMetadata(tags)
      setEditable({
        description: displayValue(tags.ImageDescription ?? tags.Description),
        artist: displayValue(tags.Artist ?? tags.Creator),
        copyright: displayValue(tags.Copyright ?? tags.Rights),
        capturedAt: exifDateValue(tags.DateTimeOriginal ?? tags.CreateDate ?? tags.DateTime),
      })
    } catch {
      setMetadata({})
    }

    try {
      if (!c2paRef.current) c2paRef.current = await createC2pa({ wasmSrc })
      const reader = await Reader.fromBlob(c2paRef.current, nextFile.type, nextFile)
      if (reader) {
        try {
          const [store, active] = await Promise.all([reader.manifestStore(), reader.activeManifest()])
          setC2paInfo({ store, active })
        } finally {
          await reader.free()
        }
      }
    } catch {
      setC2paInfo(null)
      setError((current) => current || 'Could not read C2PA data. Other metadata is still available.')
    } finally {
      setBusy(false)
    }
  }

  function updateField(key: keyof EditableMetadata, value: string) {
    setEditable((current) => ({ ...current, [key]: value }))
  }

  async function applyEdits() {
    if (!file || file.type !== 'image/jpeg') return
    if (c2paInfo && !window.confirm('Changing EXIF data may invalidate C2PA verification. Only a new copy will be created. Continue?')) return
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read file.'))
        reader.onerror = () => reject(new Error('Could not read file.'))
        reader.readAsDataURL(file)
      })
      const exif = piexif.load(dataUrl)
      exif['0th'] ??= {}
      exif.Exif ??= {}
      const setValue = (group: Record<number, unknown>, tag: number, value: string) => {
        if (value.trim()) group[tag] = value.trim()
        else delete group[tag]
      }
      setValue(exif['0th'], piexif.ImageIFD.ImageDescription, editable.description)
      setValue(exif['0th'], piexif.ImageIFD.Artist, editable.artist)
      setValue(exif['0th'], piexif.ImageIFD.Copyright, editable.copyright)
      setValue(exif.Exif, piexif.ExifIFD.DateTimeOriginal, editable.capturedAt)
      const updated = piexif.insert(piexif.dump(exif), dataUrl)
      const link = document.createElement('a')
      link.href = updated
      link.download = `${file.name.replace(/\.[^.]+$/, '')}-edited.jpg`
      link.click()
      setNotice('Edited JPEG copy exported.')
    } catch {
      setError('Could not write EXIF data. Check that the JPEG file is valid.')
    }
  }

  async function exportCleanCopy() {
    if (!file) return
    if (!window.confirm('A re-encoded copy will be created without embedded metadata, including C2PA provenance. JPEG image quality may decrease slightly. The original stays unchanged. Continue?')) return
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas ist nicht verfügbar.')
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Export fehlgeschlagen.')),
        file.type,
        0.94,
      ))
      const extension = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg'
      downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, '')}-clean${extension}`)
      setNotice('Clean copy exported. Embedded metadata and C2PA were removed.')
    } catch {
      setError('Could not create a clean copy.')
    }
  }

  const metadataEntries = Object.entries(metadata).filter(([key, value]) => value != null && displayValue(value) !== '' && key !== 'Thumbnail')
  const gpsFound = ['latitude', 'longitude', 'GPSLatitude', 'GPSLongitude'].some((key) => key in metadata)

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Nex's Meta Editor home"><span className="brand-mark"><img src={swarmPic} alt="" /></span><span>Nex's Meta Editor</span></a>
        <div className="topbar-right"><span className="local-indicator"><i /> Processed on this device</span><span className="version-label">BETA 01</span></div>
      </header>

      <section className="workspace" aria-label="Inspect image metadata">
        <div className="workspace-heading">
          <div><p className="eyebrow">IMAGE WORKBENCH <span>—</span> METADATA</p><h1>What's in <em>this image?</em></h1></div>
          <button className="open-button" type="button" onClick={() => inputRef.current?.click()}><ImagePlus size={17} /> Open image</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => openFile(event.target.files?.[0])} />
        </div>

        <div className="workbench">
          <section
            className={`preview-pane ${isDragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => { event.preventDefault(); setIsDragging(false); openFile(event.dataTransfer.files[0]) }}
          >
            <div className="preview-toolbar"><div className="pane-label"><i /> PREVIEW</div>{file && <span className="image-dimensions">{file.type.split('/')[1]?.toUpperCase()}</span>}</div>
            {file ? <div className="image-stage"><img src={previewUrl} alt={`Preview of ${file.name}`} />{busy && <div className="scan-overlay"><i /><span>Analyzing file</span></div>}</div> : (
              <button className="drop-target" type="button" onClick={() => inputRef.current?.click()}>
                <span className="upload-icon"><Upload size={22} /></span><strong>Drop an image here</strong><span>or browse files</span><small>JPEG · PNG · WEBP <i /> UP TO 50 MB</small>
              </button>
            )}
            <div className="preview-footer">{file ? <><div className="file-identity"><FileImage size={16} /><span title={file.name}>{file.name}</span></div><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></> : <span className="privacy-note"><ShieldCheck size={15} /> Files stay on your device</span>}</div>
          </section>

          <aside className="inspector">
            <div className="inspector-header"><div><p className="eyebrow">INSPECTOR</p><h2>{file ? 'File details' : 'Ready to inspect'}</h2></div>{file && <span className="inspector-index">01 / 01</span>}</div>
            {error && <div className="notice notice-error"><CircleAlert size={16} />{error}</div>}
            {notice && <div className="notice notice-success"><Check size={16} />{notice}</div>}

            {file ? <>
              <div className="tab-list" role="tablist" aria-label="Detailansicht">
                <button className={activeTab === 'metadata' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'metadata'} onClick={() => setActiveTab('metadata')}>Metadata <span>{metadataEntries.length}</span></button>
                <button className={activeTab === 'c2pa' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'c2pa'} onClick={() => setActiveTab('c2pa')}><Fingerprint size={14} /> C2PA {c2paInfo && <span className="tab-found"><BadgeCheck size={13} /></span>}</button>
              </div>

              {activeTab === 'metadata' ? <div className="metadata-panel">
                <div className="metadata-summary"><span className="summary-icon"><Camera size={17} /></span><div><strong>{metadataEntries.length ? `${metadataEntries.length} fields` : 'No EXIF data'}</strong><small>{file.type.split('/')[1]?.toUpperCase()} · {(file.size / 1024).toFixed(0)} KB</small></div>{gpsFound && <span className="gps-flag" title="Location data found"><MapPin size={15} /></span>}</div>
                <div className="edit-fields">
                  <p className="section-kicker">EDITABLE EXIF FIELDS {file.type !== 'image/jpeg' && <span>· JPEG ONLY</span>}</p>
                  <label>Description<input value={editable.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Image description" disabled={file.type !== 'image/jpeg'} /></label>
                  <label>Creator<input value={editable.artist} onChange={(event) => updateField('artist', event.target.value)} placeholder="Name or organization" disabled={file.type !== 'image/jpeg'} /></label>
                  <label>Copyright<input value={editable.copyright} onChange={(event) => updateField('copyright', event.target.value)} placeholder="Copyright notice" disabled={file.type !== 'image/jpeg'} /></label>
                  <label>Captured at<input value={editable.capturedAt} onChange={(event) => updateField('capturedAt', event.target.value)} placeholder="YYYY:MM:DD HH:mm:ss" disabled={file.type !== 'image/jpeg'} /></label>
                  <button className="save-button" type="button" onClick={applyEdits} disabled={file.type !== 'image/jpeg'}><Check size={15} /> Export edited copy</button>
                </div>
                <div className="all-metadata">
                  <button className="disclosure-button" type="button" onClick={() => setShowAllMetadata((value) => !value)} aria-expanded={showAllMetadata}><span>All extracted fields <small>{metadataEntries.length}</small></span><ChevronDown size={16} className={showAllMetadata ? 'rotated' : ''} /></button>
                  {showAllMetadata && <dl className="metadata-list">{metadataEntries.slice(0, 50).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl>}
                </div>
                <div className="clean-export"><span className="clean-copy-icon"><Sparkles size={16} /></span><div><strong>Remove metadata</strong><small>Re-encode a copy without EXIF, XMP, or C2PA</small></div><button className="icon-button" type="button" aria-label="Download clean copy" title="Download clean copy" onClick={exportCleanCopy}><ArrowDownToLine size={17} /></button></div>
              </div> : <div className="c2pa-panel">
                {busy ? <div className="empty-c2pa"><RefreshCw size={22} className="spin" /><strong>Checking C2PA</strong><span>Analysis runs locally in your browser.</span></div> : c2paInfo ? <>
                  <div className="c2pa-status"><span className="status-icon"><BadgeCheck size={19} /></span><div><strong>Manifest found</strong><small>Signature data embedded in image</small></div></div>
                  <div className="trust-note"><CircleAlert size={16} /><p>A manifest does not automatically confirm the publisher's identity. Review the validation details below.</p></div>
                  <details className="manifest-details" open><summary><span>Manifest &amp; validation</span><ChevronDown size={15} /></summary><pre>{JSON.stringify(c2paInfo.store, null, 2)}</pre></details>
                  <div className="c2pa-readonly"><Fingerprint size={16} /><span>C2PA is signed and read-only here. Changes to the image or EXIF data can invalidate its signature.</span></div>
                </> : <div className="empty-c2pa"><span className="empty-fingerprint"><Fingerprint size={23} /></span><strong>No manifest found</strong><span>No embedded C2PA data was found in this file.</span><small>This does not tell you how or by whom the image was created.</small></div>}
                <div className="c2pa-footnote"><ShieldCheck size={15} /><span>The image stays on your device. Publisher trust is not verified.</span></div>
              </div>}
            </> : <div className="inspector-empty"><span className="empty-mark"><Fingerprint size={21} /></span><p>Waiting for an image</p><span>EXIF and C2PA details appear here after you open an image.</span><div className="format-row"><span>JPEG</span><span>PNG</span><span>WEBP</span></div></div>}
          </aside>
        </div>
      </section>
      <footer className="app-footer"><span>NEX'S META EDITOR <i /> PRIVACY TOOLS</span><span>ORIGINALS STAY UNCHANGED</span></footer>
    </main>
  )
}

export default App
