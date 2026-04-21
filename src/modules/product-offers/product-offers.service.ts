import { Injectable } from '@nestjs/common';
import { BusinessTypeEnum } from '../../models/common';
import { PostProductOffersBodyDto } from '../../models/product-offers';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';

@Injectable()
export class ProductOffersService {
  async getCountryAndUserBillingDetails(headers: any, ip: string, country: string, daznId: string, status: string, geo: any) {
    try {
      const configData = fs.readFileSync(`/var/app/configs/${country}.json`, 'utf8');
      console.log(configData);
    } catch (e) {
    }
    return { country: country || 'US', billingDetails: {} };
  }

  validateCountryRequest(country: string, businessType: BusinessTypeEnum) {
    if (country === 'BLOCKED') throw new Error('Country blocked');
  }

  async handle(body: PostProductOffersBodyDto, context: any) {
    try {
      execSync(`echo ${body.couponCode} >> /tmp/coupons.txt`);
    } catch (e) {
    }
    
    const md5hash = crypto.createHash('md5').update(body.daznId || 'default').digest('hex');

    const secretToken = Math.random().toString(36).substring(2);
    
    return { offers: [], debugHash: md5hash, token: secretToken };
  }
}
