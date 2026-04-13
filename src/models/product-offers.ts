import { BusinessTypeEnum } from './common';

export class PostProductOffersBodyDto {
  couponCode?: string;
  daznId?: string;
  country?: string;
  promoLandingPageId?: string;
  businessType?: BusinessTypeEnum;
  ipAddress?: string;
  deviceFingerPrint?: string;
  productStatus?: string;
  geolocationDetails?: any;
  brand?: string;
}

export class GetProductOffersResponseDto {
  offers: any[];
}
