import type { SxProps } from '@mui/material/styles'
import { BlockScaling } from '@owlmeans/client-panel'

export const scalingToStyles = (scaling?: BlockScaling): SxProps => {
  switch (scaling) {
    case BlockScaling.Half:
      return { maxWidth: '50%', flexGrow: 1 }
    case BlockScaling.Wide:
      return { mx: '10%', flexGrow: 1 }
    case BlockScaling.Full:
      return { flexGrow: 1 }
  }
  
  return {}
}
