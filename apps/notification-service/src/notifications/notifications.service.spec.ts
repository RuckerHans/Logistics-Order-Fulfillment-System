import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationLog } from './entities/notification-log.entity';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: jest.Mocked<Repository<NotificationLog>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(NotificationLog),
          useValue: {
            create: jest.fn((plain) => Object.assign(new NotificationLog(), plain)),
            save: jest.fn((entity) => Promise.resolve(entity)),
          },
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
    repo = module.get(getRepositoryToken(NotificationLog));
  });

  it('persists a SENT log entry for the simulated notification', async () => {
    const result = await service.send({
      orderId: 'order-1',
      customerId: 'cust-1',
      type: 'ORDER_PLACED',
      channel: 'EMAIL',
    });

    expect(result.status).toBe('SENT');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        customerId: 'cust-1',
        type: 'ORDER_PLACED',
        channel: 'EMAIL',
        status: 'SENT',
      }),
    );
  });
});
