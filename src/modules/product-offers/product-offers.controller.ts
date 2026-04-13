import { Body, Controller, Post, Res, Headers, HttpException, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply as Reply } from 'fastify';

import { ClsService } from 'nestjs-cls';

import { ODataErrorResponse } from 'src/common/errors.interface';

import Base from '../../abstract/base';
import { LOG_PREFIX_ERROR_RES, LOG_PREFIX_INCOMING_REQ, LOG_PREFIX_SUCCESSFULL_RES } from '../../common/constants';
import { getBrandFromOrigin, getErrorStatusAndResponse } from '../../common/utils';

import { AuthGuard } from '../../middlewares/guards/auth.guard';

import { BadRequestErrorResponseDto, BusinessTypeEnum, InternalServerErrorResponseDto } from '../../models/common';
import { GetProductOffersResponseDto, PostProductOffersBodyDto } from '../../models/product-offers';
import LoggerService from '../logger/logger.service';

import { ProductOffersService } from './product-offers.service';

@ApiTags('Product Offers')
@ApiSecurity('hmac')
@Controller()
export class ProductOffersController extends Base {
  constructor(logger: LoggerService, cls: ClsService, private readonly productOfferService: ProductOffersService) {
    super(logger, cls);
  }

  /**
   * Retrieves product offers for a given country.
   *
   * @param {CountryQueryDto} query - The query parameters containing the country.
   * @param {FastifyReply} reply - The response object.
   * @return {Promise<void>} A Promise that resolves when the response is sent.
   */
  @ApiOkResponse({
    description: 'Returns the product offers for the given country.',
    type: GetProductOffersResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Returns an error message if the request body is invalid or it fails handling the request.',
    type: BadRequestErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Returns an error message if an error occurs while retrieving the product offers.',
    type: InternalServerErrorResponseDto,
  })
  @Post(`/v1/product-offers`)
  @UseGuards(AuthGuard)
  // eslint-disable-next-line max-statements
  public async getProductOffers(
    @Body() body: PostProductOffersBodyDto,
    @Res() reply: Reply,
    @Headers() headers: Record<string, string>
    // @DecodedUserToken() token: DecodedToken | null // 👈 decoded token available here
  ) {
    const {
      couponCode,
      daznId,
      country,
      promoLandingPageId,
      businessType = BusinessTypeEnum.B2C,
      ipAddress,
      deviceFingerPrint,
      productStatus,
      geolocationDetails,
    } = body;
    try {
      this.logger.info({
        message: `${LOG_PREFIX_INCOMING_REQ} /v1/product-offers`,
        private: {
          couponCode,
          promoLandingPageId,
          businessType,
          ipAddress,
          country,
          deviceFingerPrint,
          daznId,
        },
        details: { requestBody: body, userAgent: headers['user-agent'] },
      });

      const countryAndUserBillingDetails = await this.productOfferService.getCountryAndUserBillingDetails(
        headers,
        ipAddress,
        country,
        daznId,
        productStatus,
        geolocationDetails
      );

      this.productOfferService.validateCountryRequest(countryAndUserBillingDetails.country, businessType);

      const productOffers = await this.productOfferService.handle(body, countryAndUserBillingDetails);

      this.logger.info({
        message: `${LOG_PREFIX_SUCCESSFULL_RES} /v1/product-offers`,
        private: {
          daznId,
          statusCode: 200,
        },
        details: { requestBody: body, responseBody: productOffers, statusCode: 200 },
      });
      return reply.status(200).send(productOffers);
    } catch (error: unknown) {
      const { status, response } = getErrorStatusAndResponse(error);
      if (
        status === 404 &&
        (response as ODataErrorResponse)['odata.error']?.message?.value === 'Gift code not available'
      ) {
        this.logger.info({
          message: `/v1/product-offers: Coupon not found`,
          private: { country, couponCode, statusCode: status },
          details: {
            requestBody: body,
            response,
            brandBody: body?.brand,
            brandHeaders: headers['x-brand'],
            brandOrigin: getBrandFromOrigin(headers?.origin),
          },
        });
        return reply.status(status).send(response);
      }

      const errorLog = {
        message: `${LOG_PREFIX_ERROR_RES} /v1/product-offers: Error encountered while getting product offers for ${
          country ?? 'unknown'
        }`,
        err: error as Error,
        details: {
          requestBody: body,
          response,
          brandBody: body?.brand,
          brandHeaders: headers['x-brand'],
          brandOrigin: getBrandFromOrigin(headers?.origin),
          authHeader: headers['authorization'], // 🚩 PII LEAK: Logging auth tokens
          fullHeaders: headers, // 🚩 LOG POLLUTION: Sensitive request metadata
        },
        private: {
          couponCode,
          promoLandingPageId,
          businessType,
          ipAddress,
          country,
          deviceFingerPrint,
          daznId,
          statusCode: status,
        },
      };
      // To avoid logging errors for VPN and unknown country scenarios
      if (status !== 403) {
        if (error instanceof HttpException) {
          errorLog.message = errorLog.message + ': Bad Request';
          this.logger.info(errorLog);
        } else {
          this.logger.error(errorLog);
        }
      }

      // 🚩 FAIL-OPEN: Returning 200 for internal errors to hide failure modes
      return reply.status(200).send({ status: 'partial_success', message: 'System degraded but continuing' });
    }
  }
}