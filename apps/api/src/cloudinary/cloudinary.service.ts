// src/cloudinary/cloudinary.service.ts
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
    constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  // Upload an image to Cloudinary
  async uploadImage( file: Express.Multer.File, folder = 'litmart/products', ): Promise<UploadApiResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('An image file is required.');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WEBP, and AVIF images are allowed.',
      );
    }

    const maxFileSize = 5 * 1024 * 1024;

    if (file.size > maxFileSize) {
      throw new BadRequestException(
        'Image size must not exceed 5MB.',
      );
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            reject(
              new InternalServerErrorException('Image upload failed.'),
            );
            return;
          }

          resolve(result);
        },
      );

      uploadStream.end(file.buffer);
    });
  }

    async uploadImages( files: Express.Multer.File[], folder = 'litmart/products', ): Promise<UploadApiResponse[]> {
        if (!files || files.length === 0) {
            throw new BadRequestException('At least one image is required.');
        }

        if (files.length > 10) {
            throw new BadRequestException(
                'You can upload a maximum of 10 images at a time.',
            );
        }

        const results = await Promise.allSettled(
          files.map((file) => this.uploadImage(file, folder)),
        );

        const uploadedImages = results
          .filter(
            (result): result is PromiseFulfilledResult<UploadApiResponse> =>
              result.status === 'fulfilled',
          )
          .map((result) => result.value);

        const failedUpload = results.find(
          (result) => result.status === 'rejected',
        );

        if (failedUpload) {
          // Clean up images that uploaded successfully.
          await Promise.allSettled(
            uploadedImages.map((image) => this.deleteImage(image.public_id)),
          );

          throw failedUpload.reason instanceof Error
            ? failedUpload.reason
            : new InternalServerErrorException('One or more image uploads failed.');
        }

      return uploadedImages;
    }

    // Delete an image from Cloudinary
    async deleteImage(publicId: string) {
        if (!publicId?.trim()) {
            throw new BadRequestException('Image public ID is required.');
        }

        try {
            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: 'image',
            });

            if (result.result !== 'ok' && result.result !== 'not found') {
                throw new InternalServerErrorException(
                    'Image deletion failed.',
                );
            }

            return result;
        } catch (error) {
            if (error instanceof InternalServerErrorException) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Unable to delete image from Cloudinary.',
            );
        }
    }
}
