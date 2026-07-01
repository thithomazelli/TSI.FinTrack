-- Allow all image types including HEIC/HEIF (iPhone camera)
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]
where id = 'avatars';
