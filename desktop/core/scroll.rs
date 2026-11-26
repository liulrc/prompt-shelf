//! Shared row matcher for downward scrolling. Pixels are four interleaved bytes;
//! channel order is immaterial as long as both frames use the same format.
#![cfg_attr(not(test), no_std)]

unsafe fn score(a: *const u8, b: *const u8, w: usize, h: usize, stride: usize, shift: usize, rows: usize) -> (u32, u32) {
    let overlap = h - shift;
    let inset = (overlap / 12).min(h / 18);
    let span = overlap - inset * 2;
    let cols = w.min(43).max(1);
    let samples = rows.min(span).max(1);
    let mut bad = 0;
    let mut texture = 0;
    for r in 0..samples {
        let y = inset + (2 * r + 1) * span / (2 * samples).max(1);
        let mut previous = None;
        for c in 0..cols {
            let x = (2 * c + 1) * w / (2 * cols).max(1);
            let p = a.add((y + shift) * stride + x * 4);
            let q = b.add(y * stride + x * 4);
            let mut delta = 0;
            let mut brightness = 0i32;
            for k in 0..3 {
                let channel = *p.add(k);
                delta += channel.abs_diff(*q.add(k)) as u32;
                brightness += channel as i32;
            }
            if delta > 30 { bad += 1; }
            if let Some(last) = previous { if i32::abs(brightness - last) > 50 { texture += 1; } }
            previous = Some(brightness);
        }
    }
    let total = ((samples * cols) as u32).max(1);
    (bad * 10000 / total, texture)
}

/// Returns the number of overlapping rows; h denotes unchanged, 0 an unreliable match.
/// Both buffers must contain at least h * stride readable bytes.
#[no_mangle]
pub unsafe extern "C" fn ps_scroll_overlap(a: *const u8, b: *const u8, width: u32, height: u32, pitch: u32) -> u32 {
    let (w,h,stride) = (width as usize,height as usize,pitch as usize);
    if a.is_null() || b.is_null() || w < 4 || h < 16 || w > 32768 || h > 16384 || stride < w * 4 { return 0; }
    if score(a,b,w,h,stride,0,73).0 <= 12 { return height; }
    let minimum = (h / 11).max(12);
    let mut best = 10001;
    let mut best_shift = 0;
    let mut ambiguous = false;
    for shift in 1..=h-minimum {
        if score(a,b,w,h,stride,shift,9).0 > 650 { continue; }
        let (error, texture) = score(a,b,w,h,stride,shift,49);
        if error > 360 || texture < 4 { continue; }
        if error < best {
            ambiguous = best.saturating_sub(error) < 12 && shift.abs_diff(best_shift) > 2;
            best = error;
            best_shift = shift;
        } else if error <= best + 12 && shift.abs_diff(best_shift) > 2 { ambiguous = true; }
    }
    if best_shift == 0 || ambiguous { 0 } else { (h - best_shift) as u32 }
}

#[cfg(test)]
mod tests {
    use super::ps_scroll_overlap;
    fn page(top: usize) -> Vec<u8> {
        let mut out=Vec::new();
        for y in top..top+180 { for x in 0..96 {
            let p=((x*33 + y*57 + x*y*13) % 251) as u8;
            out.extend([p,p/2,255-p,255]);
        } }
        out
    }
    fn overlap(a:&[u8],b:&[u8]) -> u32 { unsafe { ps_scroll_overlap(a.as_ptr(),b.as_ptr(),96,180,384) } }
    #[test] fn finds_downward_scroll() { assert_eq!(overlap(&page(0),&page(67)),113); }
    #[test] fn stops_at_bottom() { assert_eq!(overlap(&page(117),&page(117)),180); }
    #[test] fn unrelated_not_joined() { assert_eq!(overlap(&page(0),&vec![0;96*180*4]),0); }
}
