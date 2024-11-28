import type { FC } from 'react'
import { ImageUploader as Uploader } from '@owlmeans/web-client'
import Paper from '@mui/material/Paper'
import type { ImageUploaderProps } from './types.js'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';

export const ImageUploader: FC<ImageUploaderProps> = ({ Root, rootProps, ...others }) => {
  return <Uploader Root={Root ?? Paper} rootProps={{
    elevation: 2,
    sx: {
      width: { sm: 45, md: 85, lg: 165 },
      height: { sm: 45, md: 85, lg: 165 },
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      cursor: 'pointer',
    },
    ...rootProps
  }} {...others}>
    <AddPhotoAlternateOutlinedIcon sx={{ fontSize: { sm: 40, md: 80, lg: 160 } }} color="primary" />
  </Uploader>
}
