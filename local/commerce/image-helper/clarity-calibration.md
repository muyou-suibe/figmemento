# Local clarity profile v1 — partial Phase 2 checkpoint

The test corpus in `tests/fixtures/photo-clarity-corpus.mjs` generates actual JPEG
bytes from deterministic scenes. The helper fully decodes and EXIF-orients those
bytes, then reduces pixels to at most 256 × 256 before measuring luminance,
gradient and Laplacian energy. It never uses browser canvas, EXIF dimensions,
URLs or an external service as quality authority.

| Control | JPEG bytes | Brightness | Gradient | Laplacian / gradient | Advisory |
| --- | ---: | ---: | ---: | ---: | --- |
| sharp detail | 123956 | 127.40 | 130.03 | 0.713 | clear |
| mild defocus | 59946 | 127.48 | 116.22 | 0.405 | soft_warning |
| severe defocus | 40084 | 127.93 | 59.10 | 0.279 | strong_warning |
| directional motion blur | 67734 | 126.98 | 116.84 | 0.332 | strong_warning |
| sharp stripes | 13468 | 133.58 | 40.43 | 0.899 | clear |
| mild stripes | 21413 | 133.63 | 39.98 | 0.578 | soft_warning |
| sharp portrait-like scene | 50148 | 88.96 | 29.29 | 1.042 | clear |
| mild portrait-like scene | 30775 | 89.00 | 19.72 | 0.608 | soft_warning |
| low texture | 12798 | 133.69 | 3.98 | 0.672 | inconclusive |
| low light/noise | 53538 | 25.50 | 9.75 | 1.103 | inconclusive |
| sharp high-detail control | 59579 | 133.43 | 372.77 | 0.999 | clear |

The warning cutoffs (0.34 strong, 0.66 soft) lie within the observed gaps
between these controls. Brightness below 40 and gradient below 12 are
inconclusive to avoid false warnings on dark/flat images. These controls are
synthetic encoded images, not a representative licensed photograph dataset;
the profile is therefore conservative guidance, **not** a guarantee of print
quality or a reason to reject an otherwise structurally valid upload. Profile
and bounded state are the only public output; numerical measurements remain
helper-internal. The analysis is ephemeral and has no durable schema. A future
model for pose/occlusion/person count remains not activated.
