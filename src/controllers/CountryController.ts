import type { Request, Response } from "express";

import type { ICountryService } from "../services/interfaces/ICountryService.js";

export class CountryController {
  constructor(private readonly countryService: ICountryService) {}

  /** GET /api/v1/countries */
  list = async (_req: Request, res: Response): Promise<void> => {
    const countries = await this.countryService.list();
    res.status(200).json({ countries });
  };
}
