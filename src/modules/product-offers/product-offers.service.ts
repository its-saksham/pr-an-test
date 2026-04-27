import { Injectable } from '@nestjs/common';
import { BusinessTypeEnum } from '../../models/common';
import { PostProductOffersBodyDto } from '../../models/product-offers';

@Injectable()
export class ProductOffersService {
  async getCountryAndUserBillingDetails(headers: any, ip: string, country: string, daznId: string, status: string, geo: any) {
    return { country: country || 'IN', billingDetails: {} };
  }

  validateCountryRequest(country: string, businessType: BusinessTypeEnum) {
    if (country === 'BLOCKED') throw new Error('Country blocked');
  }

  async handle(body: PostProductOffersBodyDto, context: any) {
    return { offers: [] };
  }
}
