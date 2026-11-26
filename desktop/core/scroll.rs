//! Shared row matcher for downward scrolling. Pixels are four interleaved bytes;
//! channel order is immaterial as long as both frames use the same format.
#![cfg_attr(not(test), no_std)]

// Sticky browser headers and footers remain at the same screen coordinates while
// the document moves. Count their contiguous unchanged edge rows once per pair.
unsafe fn fixed_rows(
    a: *const u8,
    b: *const u8,
    w: usize,
    h: usize,
    stride: usize,
    bottom: bool,
) -> usize {
    let side = w / 48;
    let inner = w - 2 * side;
    let columns = inner.min(89).max(1);
    let mut fixed = 0;
    for distance in 0..h / 3 {
        let y = if bottom { h - 1 - distance } else { distance };
        let mut changed = 0;
        for column in 0..columns {
            let x = side + (2 * column + 1) * inner / (2 * columns).max(1);
            let index = y * stride + 4 * x;
            let p = a.add(index);
            let q = b.add(index);
            let diff = (0..3)
                .map(|k| (*p.add(k)).abs_diff(*q.add(k)) as u32)
                .sum::<u32>();
            if diff > 30 {
                changed += 1;
                if changed >= 2 {
                    break;
                }
            }
        }
        if changed >= 2 {
            break;
        }
        fixed += 1;
    }
    fixed
}

unsafe fn score(
    a: *const u8,
    b: *const u8,
    w: usize,
    h: usize,
    stride: usize,
    shift: usize,
    rows: usize,
    top: usize,
    bottom: usize,
) -> (u32, u32) {
    let overlap = h - shift;
    if overlap < top + bottom + 10 {
        return (10001, 0);
    }
    let moving = overlap - top - bottom;
    let inset = (moving / 12).min(h / 18);
    let span = moving - inset * 2;
    // Ignore thin viewport borders and transient scrollbars when scoring only.
    let side = w / 48;
    let inner = w - 2 * side;
    let cols = inner.min(43).max(1);
    let samples = rows.min(span).max(1);
    let mut bad = 0;
    let mut texture = 0;
    for r in 0..samples {
        let y = top + inset + (2 * r + 1) * span / (2 * samples).max(1);
        let mut previous = None;
        for c in 0..cols {
            let x = side + (2 * c + 1) * inner / (2 * cols).max(1);
            let p = a.add((y + shift) * stride + x * 4);
            let q = b.add(y * stride + x * 4);
            let mut delta = 0;
            let mut brightness = 0i32;
            for k in 0..3 {
                let channel = *p.add(k);
                delta += channel.abs_diff(*q.add(k)) as u32;
                brightness += channel as i32;
            }
            if delta > 30 {
                bad += 1;
            }
            if let Some(last) = previous {
                if i32::abs(brightness - last) > 50 {
                    texture += 1;
                }
            }
            previous = Some(brightness);
        }
    }
    let total = ((samples * cols) as u32).max(1);
    (bad * 10000 / total, texture)
}

#[inline]
unsafe fn delta(left: *const u8, right: *const u8) -> u32 {
    (0..3)
        .map(|k| (*left.add(k)).abs_diff(*right.add(k)) as u32)
        .sum()
}

// Nearly empty strips of a webpage may look identical at an unrelated offset.
// Check the pixels on text/image edges in BOTH frames, after the cheap grid checks.
unsafe fn edge_error(
    a: *const u8,
    b: *const u8,
    w: usize,
    h: usize,
    stride: usize,
    shift: usize,
    top: usize,
    bottom: usize,
) -> Option<u32> {
    let span = h - shift - top - bottom;
    let rows = span.min(67).max(1);
    let side = w / 48;
    let inner = w - 2 * side;
    let columns = inner.min(113).max(1);
    let mut edge_count = 0u32;
    let mut bad = 0u32;
    let mut active_rows = 0u32;
    for r in 0..rows {
        let y = top + (2 * r + 1) * span / (2 * rows).max(1);
        let mut row_edges = 0;
        for c in 0..columns {
            let x = side + ((c * 5 + (r % 5)) * inner / (5 * columns).max(1)).min(inner - 1);
            let p = a.add((y + shift) * stride + x * 4);
            let q = b.add(y * stride + x * 4);
            let dx = (w - 1 - x).min(2) * 4;
            let dy = (h - 1 - y - shift).min(2) * stride;
            if delta(p, p.add(dx)) <= 30
                && delta(q, q.add(dx)) <= 30
                && delta(p, p.add(dy)) <= 30
                && delta(q, q.add(dy)) <= 30
            {
                continue;
            }
            row_edges += 1;
            if delta(p, q) > 36 {
                bad += 1;
            }
        }
        edge_count += row_edges;
        if row_edges > 0 {
            active_rows += 1;
        }
    }
    if edge_count < 8 || active_rows < 3 {
        return None;
    }
    let fraction = bad * 10000 / edge_count.max(1);
    if fraction > 1100 {
        None
    } else {
        Some(fraction)
    }
}

/// Returns the number of overlapping rows; h denotes unchanged, 0 an unreliable match.
/// A successful moving match writes the start row to copy from the newer frame to
/// seam, when supplied. Both buffers must contain at least height * pitch bytes.
#[no_mangle]
pub unsafe extern "C" fn ps_scroll_match(
    a: *const u8,
    b: *const u8,
    width: u32,
    height: u32,
    pitch: u32,
    seam: *mut u32,
) -> u32 {
    if !seam.is_null() {
        *seam = 0;
    }
    let (w, h, stride) = (width as usize, height as usize, pitch as usize);
    if a.is_null() || b.is_null() || w < 4 || h < 16 || w > 32768 || h > 16384 || stride < w * 4 {
        return 0;
    }
    if score(a, b, w, h, stride, 0, 97, 0, 0).0 <= 8 {
        return height;
    }
    let top = fixed_rows(a, b, w, h, stride, false);
    let bottom = fixed_rows(a, b, w, h, stride, true);
    let minimum = top + bottom + (h / 11).max(12);
    if minimum >= h {
        return 0;
    }
    let mut best = 10001;
    let mut best_shift = 0;
    let mut ambiguous = false;
    let mut finalists = 0;
    for shift in 1..=h - minimum {
        if score(a, b, w, h, stride, shift, 9, top, bottom).0 > 650 {
            continue;
        }
        let (error, texture) = score(a, b, w, h, stride, shift, 49, top, bottom);
        if error > 360 || texture < 4 {
            continue;
        }
        finalists += 1;
        // A view with hundreds of plausible offsets has too little unique content.
        if finalists > 96 {
            return 0;
        }
        let Some(edges) = edge_error(a, b, w, h, stride, shift, top, bottom) else {
            continue;
        };
        let error = (3 * edges + error) / 4;
        if error < best {
            ambiguous = best.saturating_sub(error) < 12 && shift.abs_diff(best_shift) > 2;
            best = error;
            best_shift = shift;
        } else if error <= best + 12 && shift.abs_diff(best_shift) > 2 {
            ambiguous = true;
        }
    }
    if best_shift == 0 || ambiguous {
        return 0;
    }
    let overlap = h - best_shift;
    if !seam.is_null() {
        *seam = (top + (overlap - top - bottom) / 2) as u32;
    }
    overlap as u32
}

// Keep the overlap-only ABI available to older clients.
#[no_mangle]
pub unsafe extern "C" fn ps_scroll_overlap(
    a: *const u8,
    b: *const u8,
    width: u32,
    height: u32,
    pitch: u32,
) -> u32 {
    ps_scroll_match(a, b, width, height, pitch, core::ptr::null_mut())
}

#[cfg(test)]
mod tests {
    use super::{ps_scroll_match, ps_scroll_overlap};
    fn page(top: usize) -> Vec<u8> {
        let mut out = Vec::new();
        for y in top..top + 180 {
            for x in 0..96 {
                let p = ((x * 33 + y * 57 + x * y * 13) % 251) as u8;
                out.extend([p, p / 2, 255 - p, 255]);
            }
        }
        out
    }
    fn overlap(a: &[u8], b: &[u8]) -> u32 {
        unsafe { ps_scroll_overlap(a.as_ptr(), b.as_ptr(), 96, 180, 384) }
    }
    #[test]
    fn finds_downward_scroll() {
        assert_eq!(overlap(&page(0), &page(67)), 113);
    }
    #[test]
    fn stitches_once_across_asymmetric_sticky_headers_and_footers() {
        const STRIDE: usize = 96 * 4;
        let shift = 73;
        let mut document = page(0);
        document.extend_from_slice(&page(shift)[(180 - shift) * STRIDE..]);
        for (head, foot) in [(55, 7), (5, 58), (23, 19)] {
            let mut start = page(0);
            let mut next = page(shift);
            let title = vec![23; head * STRIDE];
            let footer = vec![210; foot * STRIDE];
            for view in [&mut start, &mut next] {
                view[..head * STRIDE].copy_from_slice(&title);
                view[(180 - foot) * STRIDE..].copy_from_slice(&footer);
            }
            let mut seam = 0;
            let overlap = unsafe {
                ps_scroll_match(
                    start.as_ptr(),
                    next.as_ptr(),
                    96,
                    180,
                    STRIDE as u32,
                    &mut seam,
                )
            } as usize;
            assert_eq!(overlap, 180 - shift);
            assert!((head..overlap - foot).contains(&(seam as usize)));
            let mut joined = start[..(shift + seam as usize) * STRIDE].to_vec();
            joined.extend_from_slice(&next[seam as usize * STRIDE..]);
            let mut wanted = document.clone();
            wanted[..head * STRIDE].copy_from_slice(&title);
            wanted[(180 + shift - foot) * STRIDE..].copy_from_slice(&footer);
            assert_eq!(joined, wanted);
        }
    }
    #[test]
    fn rejects_a_short_repeated_strip_below_a_sticky_title() {
        const W: usize = 144;
        const H: usize = 300;
        const HEADER: usize = 70;
        const SHIFT: usize = 60;
        const THIN: usize = 15;
        let stride = W * 4;
        let mut page = Vec::with_capacity((H + SHIFT) * stride);
        for y in 0..H + SHIFT {
            for x in 0..W {
                let mut p = ((x * 37 + y * 43 + x * y * 7) % 239) as u8;
                // Two almost empty horizontal strips on an otherwise distinct page.
                for begin in [SHIFT + HEADER, H - THIN] {
                    if (begin..begin + THIN).contains(&y) {
                        p = if x % 24 == 0 { 210 } else { 249 };
                    }
                }
                page.extend([p, p, p, 255]);
            }
        }
        let mut a = page[..H * stride].to_vec();
        let mut b = page[SHIFT * stride..].to_vec();
        a[..HEADER * stride].fill(45);
        b[..HEADER * stride].fill(45);
        // Repainting the scrollbar should not count against a correct document shift.
        for row in b.chunks_exact_mut(stride) {
            row[stride - 8..].fill(195);
        }
        let run = |next: &[u8]| unsafe {
            ps_scroll_overlap(a.as_ptr(), next.as_ptr(), W as u32, H as u32, stride as u32)
        };
        assert_eq!(run(&b), (H - SHIFT) as u32);
        // The only remaining matching content is the 15px strip. Reject the jump.
        for (i, px) in b[(HEADER + THIN) * stride..]
            .chunks_exact_mut(4)
            .enumerate()
        {
            let p = ((i * 83 + i / W * 47) % 191) as u8;
            px.copy_from_slice(&[p, p, p, 255]);
        }
        assert_eq!(run(&b), 0);
    }
    #[test]
    fn stops_at_bottom() {
        assert_eq!(overlap(&page(117), &page(117)), 180);
    }
    #[test]
    fn unrelated_not_joined() {
        assert_eq!(overlap(&page(0), &vec![0; 96 * 180 * 4]), 0);
    }
}
