import { Component, OnInit } from '@angular/core';
import { Store } from '../../@core/services/store.service';
import { ActivatedRoute, Router } from '@angular/router';
import 'rxjs/add/operator/filter';

@Component({
  selector: 'ngx-login-google',
  templateUrl: './login-google.component.html',
  styleUrls: ['./login-google.component.scss']
})
export class LoginGoogleComponent {

  constructor(
    private readonly _store: Store,
    private readonly _route: ActivatedRoute,
    private readonly _router: Router
  ) {
    this._route.queryParams
    .filter(params => params.jwt)
    .subscribe(async ({ jwt, userId }) => {
      this._store.token = jwt;
      this._store.userId = userId;
      await this._router.navigate(['/']);
    });
  }
}
