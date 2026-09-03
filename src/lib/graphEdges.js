import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Edges drawn between nodes that have already been laid out.
 *
 * Shared by the landing page's pipeline graph and the ad page's vertical one.
 * Neither of them positions an edge: each node hands back its box, the curves
 * are computed from those boxes, and the CSS is left free to arrange the nodes
 * however it likes. That is what lets one set of markup be a left-to-right
 * graph on a desktop, a top-to-bottom one on a phone, and a different shape
 * again on a page built for a screen recording — with no second set of paths to
 * keep in step with the first.
 */

const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/**
 * A cubic between two boxes, leaving one and entering the other along the axis
 * the graph runs on.
 *
 * The axis is passed in rather than derived per pair, because a pair-by-pair
 * guess breaks exactly where it matters: in a fan from one node to a row of
 * five, the two outermost edges are further apart horizontally than vertically
 * and shoot out sideways while the middle three go straight down.
 */
export function curve(a, b, vertical) {
  const ac = centre(a)
  const bc = centre(b)

  if (!vertical) {
    const x1 = ac.x < bc.x ? a.x + a.w : a.x
    const x2 = ac.x < bc.x ? b.x : b.x + b.w
    const bend = Math.max(20, Math.abs(x2 - x1) * 0.55)
    const dir = ac.x < bc.x ? 1 : -1
    return `M${x1},${ac.y} C${x1 + bend * dir},${ac.y} ${x2 - bend * dir},${bc.y} ${x2},${bc.y}`
  }

  const y1 = ac.y < bc.y ? a.y + a.h : a.y
  const y2 = ac.y < bc.y ? b.y : b.y + b.h
  const bend = Math.max(16, Math.abs(y2 - y1) * 0.55)
  const dir = ac.y < bc.y ? 1 : -1
  return `M${ac.x},${y1} C${ac.x},${y1 + bend * dir} ${bc.x},${y2 - bend * dir} ${bc.x},${y2}`
}

/**
 * Measure a graph's nodes and return the curves between them.
 *
 * `declare` is called with a `link(from, to)` function and names the edges by
 * node key. It runs on every measure, so it must be stable — wrap it in
 * useCallback with whatever it closes over.
 *
 * `axisAnchors` names two nodes whose horizontal distance decides which way the
 * graph runs. Omit it and every edge is drawn vertically, which is what a
 * layout that only ever stacks wants.
 *
 * Returns the ref for the positioning container, a ref-callback factory to tag
 * each node, the computed edges, and the container's size for the SVG viewBox.
 */
export function useGraphEdges(declare, { axisAnchors = null } = {}) {
  const wrapRef = useRef(null)
  const nodes = useRef({})
  const [edges, setEdges] = useState([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const register = useCallback((key) => (el) => {
    if (el) nodes.current[key] = el
    else delete nodes.current[key]
  }, [])

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const base = wrap.getBoundingClientRect()
    const box = (key) => {
      const el = nodes.current[key]
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
    }

    let vertical = true
    if (axisAnchors) {
      const [fromKey, toKey] = axisAnchors
      const a = box(fromKey)
      const b = box(toKey)
      vertical = !a || !b || Math.abs(centre(b).x - centre(a).x) < 48
    }

    const links = []
    declare((from, to) => {
      const a = box(from)
      const b = box(to)
      if (a && b) links.push({ key: `${from}>${to}`, d: curve(a, b, vertical) })
    })

    setEdges(links)
    setSize({ w: base.width, h: base.height })
  }, [declare, axisAnchors])

  // Boxes are only real once the browser has laid them out, and they move
  // whenever anything around them does — a font swapping in, a row wrapping,
  // the window resizing, a stage of a reveal appearing.
  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    Object.values(nodes.current).forEach((el) => ro.observe(el))
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [measure])

  return { wrapRef, register, edges, size, remeasure: measure }
}
