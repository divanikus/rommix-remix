import { useEffect, useState, type JSX } from 'react'
import { useFocusContext } from '../input/focus'
import { advanceLetterRun, titleLetter } from '../library-letter'

/** Temporary orientation while holding a vertical direction; never owns focus. */
export function LetterGlimpse({
  flash
}: {
  flash?: { letter: string; sequence: number }
}): JSX.Element | null {
  const { subscribeMove } = useFocusContext()
  const [letter, setLetter] = useState<string | null>(null)
  const [jumpLetter, setJumpLetter] = useState<string | null>(null)
  useEffect(() => {
    if (!flash) return
    setJumpLetter(flash.letter)
    const timer = setTimeout(() => setJumpLetter(null), 750)
    return () => clearTimeout(timer)
  }, [flash])
  useEffect(() => {
    let run = { time: 0, direction: '', length: 0 }
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeMove((direction, element) => {
      const label = element.closest('[data-focus-collection]')
        ? element.dataset.focusLabel
        : undefined
      run = advanceLetterRun(run, label ? direction : '', performance.now())
      clearTimeout(timer)
      if (!label || run.length < 5) {
        setLetter(null)
        return
      }
      setLetter(titleLetter(label))
      timer = setTimeout(() => {
        setLetter(null)
        run.length = 0
      }, 750)
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [subscribeMove])
  return jumpLetter || letter ? (
    <div className="library-letter" aria-hidden="true">
      <span>{jumpLetter ?? letter}</span>
    </div>
  ) : null
}
