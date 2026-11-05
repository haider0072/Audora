interface ImportProgressProps {
  current: number
  total: number
}

/** How far an import of new songs has got, above the library while it runs. */
export function ImportProgress({ current, total }: ImportProgressProps) {
  return (
    <div className="library-import" role="status">
      <div className="library-import-head">
        <span>Adding songs</span>
        <span className="type-data">
          {current} / {total}
        </span>
      </div>
      <div className="library-import-track">
        <div className="library-import-fill" style={{ transform: `scaleX(${total > 0 ? current / total : 0})` }} />
      </div>
    </div>
  )
}
