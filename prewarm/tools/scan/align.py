"""Phone photo of a printed form page -> the template's pixel grid, plus an ink-only layer.

align_page(photo, template) finds the sheet in the photo, flattens it onto the template's size, then refines with ECC
(an iterative image-registration fit) so the printed lines sit on the template's lines. The returned score is how much
of the template's printed ink lands on printed ink in the photo: low means retake the photo, never guess."""
import cv2
import numpy as np


def _order(pts):
    pts = pts.reshape(4, 2).astype(np.float32)
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], np.float32)  # tl tr br bl


def find_sheet(gray):
    """The four corners of the paper (largest bright quadrilateral), or None if the photo is cropped to the page."""
    small = cv2.resize(gray, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    blur = cv2.GaussianBlur(small, (9, 9), 0)
    _, bw = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    bw = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cs, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs:
        return None
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < 0.25 * small.shape[0] * small.shape[1]:
        return None
    for eps in (0.02, 0.03, 0.05, 0.08):
        q = cv2.approxPolyDP(c, eps * cv2.arcLength(c, True), True)
        if len(q) == 4:
            return _order(q) * 4
    return None


def flatten_illumination(gray):
    """Divide out shadows and uneven light so paper is ~255 everywhere."""
    bg = cv2.medianBlur(cv2.dilate(gray, np.ones((15, 15), np.uint8)), 51)
    return cv2.divide(gray, bg, scale=255)


def line_score(aligned_gray, template_gray):
    """Share of the template's printed ink (thickened a little) that has dark pixels under it in the photo."""
    t = (template_gray < 140).astype(np.uint8)
    a = (flatten_illumination(aligned_gray) < 150).astype(np.uint8)
    hit = cv2.dilate(a, np.ones((5, 5), np.uint8))
    return float((t & hit).sum() / max(1, t.sum()))


def align_page(photo_bgr, template_gray):
    h, w = template_gray.shape
    gray = cv2.cvtColor(photo_bgr, cv2.COLOR_BGR2GRAY)
    quad = find_sheet(gray)
    if quad is not None:
        M = cv2.getPerspectiveTransform(quad, np.array([[0, 0], [w, 0], [w, h], [0, h]], np.float32))
        flat = cv2.warpPerspective(gray, M, (w, h), flags=cv2.INTER_AREA, borderValue=255)
    else:
        flat = cv2.resize(gray, (w, h), interpolation=cv2.INTER_AREA)
    # ECC refinement on shadow-flattened, blurred images (coarse then fine)
    a, t = flatten_illumination(flat), flatten_illumination(template_gray)
    warp = np.eye(3, dtype=np.float32)
    for scale in (0.2, 0.35):
        sa = cv2.GaussianBlur(cv2.resize(a, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA), (0, 0), 2)
        st = cv2.GaussianBlur(cv2.resize(t, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA), (0, 0), 2)
        W = warp.copy(); W[:2, 2] *= scale; W[2, :2] /= scale
        try:
            _, W = cv2.findTransformECC(st, sa, W, cv2.MOTION_HOMOGRAPHY,
                                        (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5), None, 5)
        except cv2.error:
            break
        W[:2, 2] /= scale; W[2, :2] *= scale; warp = W
    fine = cv2.warpPerspective(flat, warp, (w, h), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderValue=255)
    s0, s1 = line_score(flat, template_gray), line_score(fine, template_gray)
    out, score = (fine, s1) if s1 >= s0 else (flat, s0)
    return out, score


def ink_layer(aligned_gray, template_gray):
    """Only what was written: the photo's dark marks minus the printed form (thickened to forgive a pixel or two)."""
    dark = (flatten_illumination(aligned_gray) < 150).astype(np.uint8)
    printed = cv2.dilate((template_gray < 160).astype(np.uint8), np.ones((7, 7), np.uint8))
    ink = dark & (1 - printed)
    return cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
