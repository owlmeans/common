import type { FC } from 'react'
import { ImageUploader as Uploader } from '@owlmeans/web-client'
import Paper from '@mui/material/Paper'
import type { ImageUploaderProps } from './types.js'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import Box from '@mui/material/Box'
import { previewSize, wrapperSize } from './consts.local.js'

export const ImageUploader: FC<ImageUploaderProps> = ({ Root, rootProps, previewUrl, ...others }) => {
  return <Uploader Root={Root ?? Paper} rootProps={{
    elevation: 2,
    sx: {
      width: wrapperSize,
      height: wrapperSize,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      cursor: 'pointer',
    },
    ...rootProps
  }} {...others}>
    {
      previewUrl != null
        ? <Box component="img" src={previewUrl}
          sx={{ maxWidth: previewSize, maxHeight: previewSize }} />
        : <AddPhotoAlternateOutlinedIcon sx={{ fontSize: previewSize }} color="primary" />
    }
  </Uploader>
}

