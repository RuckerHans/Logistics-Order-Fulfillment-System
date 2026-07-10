import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.placeOrder(dto);
  }

  @Get()
  findAll(@Query() query: ListOrdersDto) {
    return this.ordersService.findAll(query.page, query.limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/transition')
  transition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionOrderDto) {
    return this.ordersService.transition(id, dto.newStatus);
  }
}
