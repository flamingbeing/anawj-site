// Drag a row of a list by its grip (a finger or a mouse; owner, 15 Oct 2026: Analytics and More Edit modes). The row
// follows the pointer; on release, onDrop(from, to) gets its old and new index among the list's rows.
export function gripDrag(e, list, onDrop) {
  e.preventDefault();
  const grip = e.currentTarget || e.target, li = grip.closest('li'), rows = [...list.children], y0 = e.clientY;
  li.classList.add('dragging'); grip.setPointerCapture?.(e.pointerId);
  const move = ev => { li.style.transform = `translateY(${ev.clientY - y0}px)`; };
  const up = ev => {
    for (const [k, f] of [['pointermove', move], ['pointerup', up], ['pointercancel', up]]) grip.removeEventListener(k, f);
    li.classList.remove('dragging'); li.style.transform = '';
    const to = rows.filter(r => r !== li).filter(r => { const b = r.getBoundingClientRect(); return ev.clientY > b.top + b.height / 2; }).length;
    const from = rows.indexOf(li);
    if (to !== from) onDrop(from, to);
  };
  grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
}
// an id moved within a list: a new array
export const moveIn = (list, from, to) => { const a = [...list]; a.splice(to, 0, ...a.splice(from, 1)); return a; };
