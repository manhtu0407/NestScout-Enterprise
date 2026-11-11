import type { ImageSourcePropType } from 'react-native';
import type { KaelExpression } from './kael-phase';

export const appIconImage: ImageSourcePropType = require('../../../assets/horizon/app-icon.png');

export const kaelPlushImage: ImageSourcePropType =require('../../../assets/horizon/kael-plush-transparent.png');

export const kaelExpressionImages: Readonly<Record<KaelExpression, ImageSourcePropType>> = {
  idle: require('../../../assets/horizon/kael-expression-idle.png'),
  thinking: require('../../../assets/horizon/kael-expression-thinking.png'),
  focus: require('../../../assets/horizon/kael-expression-focus.png'),
  alert: require('../../../assets/horizon/kael-expression-alert.png'),
  calm: require('../../../assets/horizon/kael-expression-calm.png'),
  happy: require('../../../assets/horizon/kael-expression-happy.png'),
  heart: require('../../../assets/horizon/kael-expression-heart.png'),
};
