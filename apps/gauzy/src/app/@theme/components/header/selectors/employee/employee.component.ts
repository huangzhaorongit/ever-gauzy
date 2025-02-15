import {
	Component,
	OnInit,
	OnDestroy,
	Input,
	Output,
	EventEmitter,
	AfterViewInit,
	ChangeDetectorRef,
	ChangeDetectionStrategy
} from '@angular/core';
import { EmployeesService } from 'apps/gauzy/src/app/@core/services/employees.service';
import { filter, debounceTime } from 'rxjs/operators';
import { Store } from 'apps/gauzy/src/app/@core/services/store.service';
import {
	IOrganization,
	ISelectedEmployee,
	DEFAULT_TYPE
} from '@gauzy/contracts';
import { ActivatedRoute } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { EmployeeStore } from 'apps/gauzy/src/app/@core/services/employee-store.service';

//TODO: Currently the whole application assumes that if employee or id is null then you need to get data for All Employees
//That should not be the case, sometimes due to permissions like CHANGE_SELECTED_EMPLOYEE not being available
//we need to handle cases where No Employee is selected too

export const ALL_EMPLOYEES_SELECTED: ISelectedEmployee = {
	id: null,
	firstName: 'All Employees',
	lastName: '',
	imageUrl: 'https://i.imgur.com/XwA2T62.jpg',
	defaultType: DEFAULT_TYPE.ALL_EMPLOYEE,
	tags: [],
	skills: []
};

export const NO_EMPLOYEE_SELECTED: ISelectedEmployee = {
	id: null,
	firstName: '',
	lastName: '',
	imageUrl: '',
	defaultType: DEFAULT_TYPE.NO_EMPLOYEE,
	tags: [],
	skills: []
};

@UntilDestroy({ checkProperties: true })
@Component({
	selector: 'ga-employee-selector',
	templateUrl: './employee.component.html',
	styleUrls: ['./employee.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeSelectorComponent
	implements OnInit, OnDestroy, AfterViewInit {
	@Input()
	skipGlobalChange: boolean;
	@Input()
	disabled: boolean;
	@Input()
	defaultSelected: boolean;
	@Input()
	showAllEmployeesOption: boolean;
	@Input()
	placeholder: string;

	@Input()
	set selectedDate(value: Date) {
		//This will set _selectDate too
		this.loadWorkingEmployeesIfRequired(
			this.store.selectedOrganization,
			value
		);
	}

	get selectedDate() {
		return this._selectedDate;
	}

	private _selectedOrganization?: IOrganization;
	private _selectedDate?: Date;

	@Output()
	selectionChanged: EventEmitter<ISelectedEmployee> = new EventEmitter();

	people: ISelectedEmployee[] = [];
	selectedEmployee: ISelectedEmployee;

	constructor(
		private employeesService: EmployeesService,
		private store: Store,
		private activatedRoute: ActivatedRoute,
		private cdRef: ChangeDetectorRef,
		private readonly _employeeStore: EmployeeStore
	) {}

	ngOnInit() {
		this.defaultSelected =
			this.defaultSelected === undefined ? true : this.defaultSelected;
		this.showAllEmployeesOption =
			this.showAllEmployeesOption === undefined
				? true
				: this.showAllEmployeesOption;

		this._loadEmployees();
		this._loadEmployeeId();

		this.activatedRoute.queryParams
			.pipe(
				debounceTime(500),
				filter((query) => !!query.employeeId),
				untilDestroyed(this)
			)
			.subscribe((query) => {
				this.selectEmployeeById(query.employeeId);
			});
	}

	ngAfterViewInit(): void {
		this._employeeStore.employeeAction$
			.pipe(untilDestroyed(this))
			.subscribe(() => {
				this.getEmployees(
					this.store.selectedOrganization,
					this.store.selectedDate
				);
			});
		this.cdRef.detectChanges();
	}

	searchEmployee(term: string, item: any) {
		if (item.firstName && item.lastName) {
			return (
				item.firstName.toLowerCase().includes(term.toLowerCase()) ||
				item.lastName.toLowerCase().includes(term.toLowerCase())
			);
		} else if (item.firstName) {
			return item.firstName.toLowerCase().includes(term.toLowerCase());
		} else if (item.lastName) {
			return item.lastName.toLowerCase().includes(term.toLowerCase());
		}
	}

	selectEmployee(employee: ISelectedEmployee) {
		if (!this.skipGlobalChange) {
			this.store.selectedEmployee = employee || ALL_EMPLOYEES_SELECTED;
		} else {
			this.selectedEmployee = employee;
		}
		this.selectionChanged.emit(employee);
	}

	selectEmployeeById(employeeId: string) {
		const employees = this.people.filter(
			(employee: ISelectedEmployee) => employeeId === employee.id
		);
		if (employees.length > 0) {
			this.selectEmployee(employees[0]);
		}
	}
	getShortenedName(firstName: string, lastName: string) {
		if (firstName && lastName) {
			return firstName + ' ' + lastName[0] + '.';
		} else {
			return firstName || lastName || '[error: bad name]';
		}
	}

	getFullName(firstName: string, lastName: string) {
		return firstName && lastName
			? firstName + ' ' + lastName
			: firstName || lastName;
	}

	private _loadEmployeeId() {
		this.store.selectedEmployee$
			.pipe(untilDestroyed(this))
			.subscribe((emp) => {
				this.selectedEmployee = emp;
			});
	}

	private async _loadEmployees() {
		this.store.selectedOrganization$
			.pipe(
				filter((organization) => !!organization),
				untilDestroyed(this)
			)
			.subscribe(async (org) => {
				if (org) {
					await this.loadWorkingEmployeesIfRequired(
						org,
						this.store.selectedDate
					);
				}
			});

		this.store.selectedDate$
			.pipe(untilDestroyed(this))
			.subscribe((date) => {
				this.loadWorkingEmployeesIfRequired(
					this.store.selectedOrganization,
					date
				);
			});

		if (!this.selectedEmployee) {
			// This is so selected employee doesn't get reset when it's already set from somewhere else
			this.selectEmployee(this.people[0]);
		}

		if (
			!this.defaultSelected &&
			this.selectedEmployee === ALL_EMPLOYEES_SELECTED
		)
			this.selectedEmployee = null;
	}

	loadWorkingEmployeesIfRequired = async (
		org: IOrganization,
		selectedDate: Date
	) => {
		//If no organization, then something is wrong
		if (!org) {
			this.people = [];
			return;
		}

		//Save repeated API calls for the same organization & date
		if (
			this._selectedOrganization &&
			this._selectedDate &&
			selectedDate &&
			org.id === this._selectedOrganization.id &&
			selectedDate.getTime() === this._selectedDate.getTime()
		) {
			return;
		}

		this._selectedOrganization = org;
		this._selectedDate = selectedDate;
		await this.getEmployees(org, selectedDate);
	};

	private getEmployees = async (org: IOrganization, selectedDate: Date) => {
		if (!org) {
			this.people = [];
			return;
		}

		const { items } = await this.employeesService.getWorking(
			org.id,
			org.tenantId,
			selectedDate,
			true
		);

		this.people = [
			...items.map((e) => {
				return {
					id: e.id,
					firstName: e.user.firstName,
					lastName: e.user.lastName,
					imageUrl: e.user.imageUrl
				};
			})
		];

		//Insert All Employees Option
		if (this.showAllEmployeesOption) {
			this.people.unshift(ALL_EMPLOYEES_SELECTED);
		}

		//Set selected employee if no employee selected
		if (items.length > 0 && !this.store.selectedEmployee) {
			this.store.selectedEmployee =
				this.people[0] || ALL_EMPLOYEES_SELECTED;
		}
	};

	ngOnDestroy() {}
}
